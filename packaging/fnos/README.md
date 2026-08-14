# 飞牛 fnOS 安装包

`fnpack build` 会在当前目录生成 `findrepeatedsong.fpk`。

安装时填写音乐库的顶级目录。该目录会在容器内映射为 `/music`；应用界面中应选择 `/music` 或其子目录进行扫描和整理。

应用数据（SQLite 数据库与配置）保存在飞牛的应用运行时数据目录中，升级和重启后会保留。
