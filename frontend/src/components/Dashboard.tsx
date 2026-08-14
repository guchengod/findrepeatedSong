import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  FolderOpen,
  History,
  Library,
  Music2,
  RefreshCw,
  Tags,
  Trash2,
} from 'lucide-react';

const API_BASE = '/api';

interface Stats {
  total_songs: number;
  total_duplicates: number;
  storage_used_gb: number;
  jobs_running: number;
}

interface TrashRecord {
  id: number;
  size: number;
}

export interface ActivityItem {
  id: string;
  kind: 'scan' | 'duplicate' | 'organize' | 'metadata' | 'trash' | 'restore';
  title: string;
  detail: string;
  timestamp: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

export const Dashboard = ({
  activity,
  connected,
}: {
  activity: ActivityItem[];
  connected: boolean;
}) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trash, setTrash] = useState<TrashRecord[]>([]);

  const refresh = async () => {
    const [statsResponse, trashResponse] = await Promise.allSettled([
      axios.get<Stats>(`${API_BASE}/stats`),
      axios.get<TrashRecord[]>(`${API_BASE}/trash`),
    ]);
    if (statsResponse.status === 'fulfilled') setStats(statsResponse.value.data);
    if (trashResponse.status === 'fulfilled') setTrash(trashResponse.value.data);
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const recoverable = useMemo(() => trash.reduce((sum, item) => sum + item.size, 0), [trash]);
  const iconFor = {
    scan: Library,
    duplicate: Library,
    organize: FolderOpen,
    metadata: Tags,
    trash: Trash2,
    restore: History,
  };

  return (
    <section className="library-dashboard">
      <div className="library-hero">
        <h1>音乐库概览</h1>
        <p>本地音乐库的状态、待处理事项和最近执行结果。</p>
      </div>

      <div className="overview-metrics" aria-label="音乐库状态">
        <div><Music2 size={19} /><span>已收录曲目</span><strong>{stats?.total_songs ?? '—'}</strong></div>
        <div><Library size={19} /><span>待处理重复组</span><strong>{stats?.total_duplicates ?? '—'}</strong></div>
        <div><Trash2 size={19} /><span>可恢复空间</span><strong>{formatBytes(recoverable)}</strong></div>
        <div><RefreshCw size={19} /><span>运行中的任务</span><strong>{stats?.jobs_running ?? '—'}</strong></div>
      </div>

      <div className="dashboard-columns">
        <section className="activity-panel">
          <div className="panel-heading">
            <h2>最近活动</h2>
          </div>
          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-activity">
                <CheckCircle2 size={20} />
                <span>音乐库已准备就绪，开始一次扫描以建立处理记录。</span>
              </div>
            ) : activity.slice(0, 6).map((item) => {
              const Icon = iconFor[item.kind];
              return (
                <div className="activity-row" key={item.id}>
                  <span className={`activity-icon activity-${item.kind}`}><Icon size={18} /></span>
                  <span className="activity-line" />
                  <div className="activity-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>
                  <time>{item.timestamp}</time>
                </div>
              );
            })}
          </div>
        </section>

        <section className="duplicate-panel">
          <div className="panel-heading">
            <div><h2>待处理重复组</h2><span className="count-chip">{stats?.total_duplicates ?? 0} 组</span></div>
          </div>
          <div className="duplicate-summary">
            <span>待审核重复文件占用空间（估算）</span>
            <strong>{stats ? `${stats.storage_used_gb.toFixed(2)} GB` : '—'}</strong>
            <em>在“手动操作”中选择音乐后，可单独扫描和审核重复项。</em>
          </div>
          <div className="duplicate-table-labels"><span>本地保护状态</span><span>数量</span></div>
          <div className="duplicate-table-row"><span><History size={17} />回收站中的文件</span><b>{trash.length} 项</b></div>
          <div className="duplicate-table-row"><span><Trash2 size={17} />可恢复空间</span><b>{formatBytes(recoverable)}</b></div>
          <button className="overview-refresh" onClick={refresh}><RefreshCw size={14} />刷新概览</button>
        </section>
      </div>

      <p className="local-first-note"><span className={connected ? 'connection-dot is-online' : 'connection-dot'} />所有操作均在本地执行，不会上传或分享您的音乐数据。</p>
    </section>
  );
};
