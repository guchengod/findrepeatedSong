import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "app": {
        "title": "MUSIC ENGINE",
        "home": "Home",
        "homeMenu": "Command Deck",
        "mainMenu": "Main Menu",
        "deduper": "Deduper",
        "organizer": "Organizer",
        "completer": "Metadata Completer",
        "scheduler": "Scheduler"
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
        "disabled": "Disabled",
        "toggle": "Toggle",
        "bgExecution": "Automatic Background Execution",
        "never": "Never"
      },
      "settings": {
        "title": "System Config",
        "subtitle": "Configure Your Setup",
        "save": "Save",
        "reset": "Reset",
        "close": "Close"
      },
      "common": {
        "loading": "Loading...",
        "running": "Running...",
        "done": "Done",
        "confirm": "Confirm",
        "cancel": "Cancel"
      },
      "pathBrowser": {
        "title": "Select Directory",
        "select": "Select",
        "empty": "No entries",
        "selected": "Selected"
      },
      "cronBuilder": {
        "everyMinute": "Every minute",
        "every5Minutes": "Every 5 minutes",
        "everyHour": "Every hour",
        "dailyMidnight": "Daily at midnight",
        "daily2AM": "Daily at 2AM",
        "weeklySunday": "Weekly on Sunday",
        "monthly": "Monthly",
        "next5Runs": "Next 5 runs"
      },
      "schedulerHistory": {
        "noHistory": "No History — Task Never Run"
      },
      "dashboard": {
        "online": "Online",
        "offline": "Offline",
        "noRecentMissions": "No Recent Missions",
        "activeMission": "Active Mission",
        "recentMissions": "Recent Missions",
        "signalLost": "SIGNAL LOST — RECONNECTING...",
        "totalSongs": "Total Songs",
        "duplicates": "Duplicates",
        "storageUsed": "Storage Used",
        "jobsRunning": "Jobs Running"
      }
    }
  },
  zh: {
    translation: {
      "app": {
        "title": "音乐引擎",
        "home": "首页",
        "homeMenu": "指挥台",
        "mainMenu": "主菜单",
        "deduper": "去重工具",
        "organizer": "音乐整理",
        "completer": "元数据补全",
        "scheduler": "任务调度"
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
        "disabled": "已禁用",
        "toggle": "切换",
        "bgExecution": "自动后台执行",
        "never": "从未"
      },
      "settings": {
        "title": "系统配置",
        "subtitle": "配置您的设置",
        "save": "保存",
        "reset": "重置",
        "close": "关闭"
      },
      "common": {
        "loading": "加载中...",
        "running": "运行中...",
        "done": "完成",
        "confirm": "确认",
        "cancel": "取消"
      },
      "pathBrowser": {
        "title": "选择目录",
        "select": "选择",
        "empty": "目录为空",
        "selected": "已选择"
      },
      "cronBuilder": {
        "everyMinute": "每分钟",
        "every5Minutes": "每5分钟",
        "everyHour": "每小时",
        "dailyMidnight": "每天午夜",
        "daily2AM": "每天凌晨2点",
        "weeklySunday": "每周日",
        "monthly": "每月",
        "next5Runs": "接下来5次执行"
      },
      "schedulerHistory": {
        "noHistory": "无历史记录 — 任务从未运行"
      },
      "dashboard": {
        "online": "在线",
        "offline": "离线",
        "noRecentMissions": "无最近任务",
        "activeMission": "执行中的任务",
        "recentMissions": "最近任务",
        "signalLost": "信号丢失 — 重新连接中...",
        "totalSongs": "歌曲总数",
        "duplicates": "重复歌曲",
        "storageUsed": "存储使用",
        "jobsRunning": "运行任务"
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
