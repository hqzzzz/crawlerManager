# Docker 使用说明

## 快速开始

### 1. 构建并启动容器

```bash
# 使用 docker-compose
npm run docker:up

# 或者手动执行
docker-compose up -d
```

### 2. 访问应用

打开浏览器访问：http://localhost:3000

### 3. 查看日志

```bash
npm run docker:logs

# 或者
docker-compose logs -f
```

### 4. 停止容器

```bash
npm run docker:down

# 或者
docker-compose down
```

### 5. 重启容器

```bash
npm run docker:restart
```

## 数据持久化

以下数据会被持久化到本地目录：

- `./data` - SQLite 数据库文件
- `./crawlerXnode/result` - 爬虫结果数据
- `./crawlerXnode/logs` - 爬虫日志
- `./crawlerXnode/crawler` - 爬虫脚本 (可选挂载)

## 环境变量配置

创建 `.env` 文件 (基于 `.env.example`):

```bash
cp .env.example .env
```

然后编辑 `.env` 文件配置你的参数:

```env
# 管理员账户 (生产环境请修改)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin

# JWT 密钥 (生产环境请修改为随机字符串)
JWT_SECRET=your_random_secret_key_here

# 其他配置
DB_TYPE=sqlite
GEMINI_API_KEY=your_api_key
```

在 `docker-compose.yml` 中会自动读取这些环境变量。

也可以在 `docker-compose.yml` 中直接配置:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DB_TYPE=sqlite
  - ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
  - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}
  - JWT_SECRET=${JWT_SECRET:-super_secret_jwt_key_change_me}
  - GEMINI_API_KEY=your_api_key  # 可选
```

### 使用 MySQL 数据库

如果要使用 MySQL，需要修改 `docker-compose.yml`:

```yaml
environment:
  - DB_TYPE=mysql
  - DB_HOST=mysql
  - DB_USER=root
  - DB_PASSWORD=your_password
  - DB_NAME=crawler_manager
  - DB_PORT=3306
```

并取消注释 MySQL 服务的配置。

## 重新构建镜像

当代码更新后，需要重新构建镜像:

```bash
npm run docker:build

# 然后重新启动
npm run docker:up
```

## 进入容器

```bash
docker exec -it crawler-manager sh
```

## 常见问题

### 容器启动失败

查看日志:
```bash
docker-compose logs
```

### 端口被占用

修改 `docker-compose.yml` 中的端口映射:
```yaml
ports:
  - "3001:3000"  # 将主机端口改为 3001
```

### 数据丢失

确保数据目录已正确挂载，并且有写入权限。

### 登录失败

确保环境变量配置正确:
- `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 必须匹配
- 前端登录时使用的用户名和密码要与环境变量一致

## 开发模式

Docker 模式主要用于生产环境部署。开发时建议使用:

```bash
npm run dev
```

## GitHub Actions 自动构建

本项目配置了 GitHub Actions CI/CD，自动构建 Docker 镜像。

### 配置步骤

1. **GitHub Container Registry (ghcr.io)**

   无需额外配置，直接使用 `secrets.GITHUB_TOKEN` 即可。

2. **Docker Hub (可选)**

   如果使用 Docker Hub，需要在仓库 Settings -> Secrets and variables -> Actions 中添加:

   - `DOCKERHUB_USERNAME`: Docker Hub 用户名
   - `DOCKERHUB_TOKEN`: Docker Hub 访问令牌

### 触发条件

- 推送到 `main` 或 `master` 分支
- 创建新的标签 (如 `v1.0.0`)
- Pull Request

### 镜像标签

- 分支推送：`branch-name`
- 标签推送：`v1.0.0`, `1.0`, `latest`
- PR: `pr-<number>`

### 使用构建的镜像

```bash
# GitHub Container Registry
docker pull ghcr.io/username/repo:main

# Docker Hub
docker pull yourusername/crawler-manager:latest
```

### 查看 Workflow 状态

访问仓库的 Actions 标签页查看构建状态。
