import cron from "node-cron";
import { queryAll, queryRun } from "./db.js";
import { executeScript } from "./crawler-engine.js";

const activeJobs = new Map<string, any>();

export async function setupScheduler() {
  console.log("Setting up scheduler...");
  
  // 初始加载
  const rows: any = await queryAll("SELECT * FROM scripts");
  rows.forEach((script: any) => {
    if (script.cron) {
      scheduleScript(script.id, script.cron, script.code, script.params, script.ownerId);
    }
  });

  // 轮询更改
  setInterval(async () => {
    try {
      const rows: any = await queryAll("SELECT * FROM scripts");
      const currentIds = new Set(rows.map((r: any) => r.id));
      
      // 停止已移除的任务
      for (const [id, job] of activeJobs.entries()) {
        if (!currentIds.has(id)) {
          job.stop();
          activeJobs.delete(id);
        }
      }

      // 更新/启动任务
      rows.forEach((script: any) => {
        if (script.cron) {
          const existingJob = activeJobs.get(script.id);
          if (!existingJob) {
            scheduleScript(script.id, script.cron, script.code, script.params, script.ownerId);
          }
        } else if (activeJobs.has(script.id)) {
          activeJobs.get(script.id).stop();
          activeJobs.delete(script.id);
        }
      });
    } catch (e) {
      console.error("Scheduler poll error:", e);
    }
  }, 30000); // 每 30 秒检查一次
}

export function scheduleScript(id: string, cronExpr: string, code: string, params: any, ownerId: string) {
  try {
    const job = cron.schedule(cronExpr, async () => {
      console.log(`Running scheduled script: ${id}`);
      try {
        await queryRun("UPDATE scripts SET status = 'running' WHERE id = ?", [id]);
        await executeScript(code, params, id, ownerId);
        await queryRun("UPDATE scripts SET status = 'idle', lastRun = datetime('now') WHERE id = ?", [id]);
      } catch (error: any) {
        console.error(`Error running scheduled script ${id}:`, error);
        await queryRun("UPDATE scripts SET status = 'error' WHERE id = ?", [id]);
      }
    });
    activeJobs.set(id, job);
    console.log(`Scheduled script ${id} with ${cronExpr}`);
  } catch (e) {
    console.error(`Invalid cron expression for script ${id}: ${cronExpr}`);
  }
}
