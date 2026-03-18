# Music De-duplicator (高音质音乐去重工具)

[![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat&logo=react)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=flat&logo=docker)](https://www.docker.com/)

一个专为百万级大容量曲库设计的高性能音乐去重方案。支持中文/英文歌曲名相似度识别（默认 80%+），采用 SQLite 持久化存储以保持超低内存占用，并具备智能删除机制（优先保留无损格式和高码率文件）。

## ✨ 核心特性

- 🚀 **百万级处理能力**：基于倒排索引 (Inverted Index) 和并查集 (Union-Find) 的高效算法，快速比对百万级歌曲名。
- 🔍 **智能相似度匹配**：支持 50%-100% 相似度调节，自动过滤歌曲名中的 "320k"、"Official"、"Audio" 等干扰标签。
- 🛡️ **超低内存占用**：不采用纯内存存储，所有元数据持久化至本地 SQLite 数据库。
- 🎼 **无损格式优先**：删除机制自动识别 `FLAC`, `WAV`, `APE`, `ALAC` 等无损格式。
- 🗑️ **智能清理策略**：
  - 相同相似度下，优先保留无损格式。
  - 相同格式下，优先保留文件体积最大的版本。
- 🐳 **Docker 支持**：一键部署，跨平台运行。
- 🤖 **自动化流水线**：支持预配置路径和相似度后，一键自动完成“扫描-分析-清理”全流程。

## 🛠️ 技术栈

- **后端**: Go (Gin, GORM, SQLite)
- **前端**: React (Vite, TypeScript, TailwindCSS, Lucide Icons)
- **部署**: Docker (Multi-stage Build)

## 🚀 快速开始

### 使用 Docker (推荐)

1. **构建镜像**:
   ```bash
   docker build -t music-deduper .
   ```

2. **运行容器**:
   将你的曲库挂载到容器的 `/music` 目录：
   ```bash
   docker run -d \
     -p 8080:8080 \
     -v "/path/to/your/music:/music" \
     -v "$(pwd)/data:/app/data" \
     --name music-deduper \
     music-deduper
   ```

3. **访问界面**:
   打开浏览器访问 `http://localhost:8080`

### 本地开发

**后端**:
```bash
cd backend
go mod download
go run .
```

**前端**:
```bash
cd frontend
npm install
npm run dev
```

## 📖 使用指南

1. **Step 1: 扫描 (Scan)**
   - 输入要扫描的目录路径（Docker 运行请确保输入容器内的挂载路径，如 `/music`）。
   - 系统将递归扫描（深度限制 10 层）并提取文件元数据。
2. **Step 2: 分析 (Analyze)**
   - 滑动选择相似度阈值（建议 80%）。
   - 系统将通过高性能索引找出所有疑似重复的组。
3. **Step 3: 清理 (Clean)**
   - **手动清理**: 查看重复组，手动选择要保留的文件。
   - **自动清理**: 一键执行，系统将按照“无损优先 > 体积优先”原则保留每组中最优质的文件。

## ⚠️ 注意事项

- **数据安全**: 自动删除操作是不可逆的，建议在首次使用时先进行手动确认，或在执行前备份重要曲库。
- **扫描深度**: 程序默认扫描深度为 10 级，以防止死循环挂载。

## 📄 开源协议

MIT License
