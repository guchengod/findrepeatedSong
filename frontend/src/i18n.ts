import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "app": {
        "title": "MUSIC ENGINE",
        "deduper": "Deduper",
        "organizer": "Organizer",
        "completer": "Completer",
        "scheduler": "Scheduler",
        "settings": "Settings"
      },
      "deduper": {
        "title": "Deduper",
        "subtitle": "Scan and remove duplicate tracks based on similarity",
        "findDuplicates": "Find Duplicates",
        "autoDelete": "Auto Delete",
        "refresh": "Refresh",
        "scanPath": "Scan Path",
        "similarity": "Similarity Threshold",
        "strategies": "Strategies",
        "keep": "Keep",
        "delete": "Delete",
        "group": "Group",
        "files": "Files"
      },
      "organizer": {
        "title": "Organizer",
        "subtitle": "Structure: Artist / Album / SongName",
        "mode": "Mode",
        "move": "Move",
        "copy": "Copy",
        "start": "Start Organizing",
        "source": "Source",
        "target": "Target"
      },
      "completer": {
        "title": "Metadata Completer",
        "subtitle": "Complete missing Artist, Album and Tags via MusicBrainz",
        "start": "Start Completion",
        "logs": "Real-time Logs"
      },
      "scheduler": {
        "title": "Scheduler",
        "subtitle": "Automate background tasks",
        "cron": "Cron Expression",
        "lastRun": "Last Run",
        "active": "Active",
        "disabled": "Disabled"
      },
      "settings": {
        "title": "Settings",
        "subtitle": "Global configuration",
        "save": "Save"
      },
      "common": {
        "loading": "Loading...",
        "running": "Running...",
        "done": "Done",
        "confirm": "Confirm",
        "cancel": "Cancel"
      }
    }
  },
  zh: {
    translation: {
      "app": {
        "title": "音乐引擎",
        "deduper": "去重工具",
        "organizer": "音乐整理",
        "completer": "元数据补全",
        "scheduler": "任务调度",
        "settings": "系统设置"
      },
      "deduper": {
        "title": "去重工具",
        "subtitle": "基于相似度扫描并清理重复曲目",
        "findDuplicates": "查找重复歌曲",
        "autoDelete": "自动删除",
        "refresh": "刷新列表",
        "scanPath": "扫描路径",
        "similarity": "相似度阈值",
        "strategies": "删除策略",
        "keep": "保留",
        "delete": "删除",
        "group": "分组",
        "files": "个文件"
      },
      "organizer": {
        "title": "歌曲整理",
        "subtitle": "目录结构: 艺术家 / 专辑 / 歌曲名",
        "mode": "整理模式",
        "move": "移动",
        "copy": "复制",
        "start": "开始整理",
        "source": "源路径",
        "target": "目标路径"
      },
      "completer": {
        "title": "元数据补全",
        "subtitle": "通过 MusicBrainz 自动补全缺失的艺术家、专辑和标签",
        "start": "自动补全",
        "logs": "实时补全日志"
      },
      "scheduler": {
        "title": "任务调度",
        "subtitle": "自动化后台执行任务",
        "cron": "Cron 表达式",
        "lastRun": "上次运行",
        "active": "已激活",
        "disabled": "已禁用"
      },
      "settings": {
        "title": "系统设置",
        "subtitle": "全局参数配置",
        "save": "保存"
      },
      "common": {
        "loading": "加载中...",
        "running": "运行中...",
        "done": "完成",
        "confirm": "确认",
        "cancel": "取消"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
