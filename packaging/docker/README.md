# Docker 安装（Linux、macOS、Windows）

1. 下载与设备 CPU 匹配的 Docker 镜像归档，并导入：

   ```bash
   docker load -i findrepeatedsong-linux-amd64-0.1.2.tar
   ```

   ARM 设备（包括 Apple Silicon Docker Desktop）使用 `findrepeatedsong-linux-arm64-0.1.2.tar`。
2. 将 `.env.example` 复制为 `.env`，并设置 `FINDREPEATEDSONG_MUSIC_DIR` 为音乐库目录。
   - Linux/macOS：`/Volumes/Music`、`/mnt/music` 等绝对路径。
   - Windows Docker Desktop：使用共享驱动器路径，例如 `C:/Users/your-name/Music`。
3. 运行：

   ```bash
   docker compose --env-file .env -f compose.yaml up -d
   ```

4. 打开 `http://localhost:38491`。容器内可见的音乐目录为 `/music`。

应用数据会保存到 `FINDREPEATEDSONG_DATA_DIR`。
