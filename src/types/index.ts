export interface Script {
  id: string;
  name: string;
  code: string;
  cron: string;
  params: string;
  status: "idle" | "running" | "error";
  lastRun?: string;
  ownerId: string;
}

export interface CrawlerResult {
  id: string;
  link: string;
  scriptId: string;
  title: string;
  content: string;
  url: string;
  timestamp: string;
  raw: string;
  ownerId: string;
}

export interface RSSSubscription {
  id: string;
  url: string;
  name: string;
  ownerId: string;
}
