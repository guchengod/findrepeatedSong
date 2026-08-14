# 原生运行包

每个压缩包包含 Go 原生后端二进制和前端静态资源，不需要 Docker。

- Linux/macOS：解压后运行 `./start.sh`（macOS 也可双击 `start.command`）。
- Windows：解压后右键使用 PowerShell 运行 `start.ps1`。

服务默认打开在 `http://127.0.0.1:8080`，应用数据保存在包目录下的 `data/`。扫描和整理音乐前，请在系统的文件权限设置中授予该应用访问音乐库目录的权限。
