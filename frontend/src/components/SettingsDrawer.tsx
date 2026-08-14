import { useEffect, useState } from 'react';
import axios from 'axios';
import { FolderCog, RotateCcw, Save, Settings2 } from 'lucide-react';
import { PathBrowser } from './PathBrowser';

const API_BASE = '/api';

interface AppConfig {
  key: string;
  value: string;
  desc: string;
}

const configMeta: Record<string, { title: string; hint: string }> = {
  source_path: { title: '默认音乐库路径', hint: '扫描重复项时读取的音乐目录' },
  target_path: { title: '整理目标路径', hint: '整理后的歌曲将移动或复制到此目录' },
  mb_user_agent: { title: 'MusicBrainz 标识', hint: '访问元数据服务时使用的应用标识' },
  mb_api_key: { title: 'MusicBrainz API Key', hint: '可选访问令牌，仅用于本机向 MusicBrainz 发起请求' },
  lyrics_provider: { title: '歌词来源', hint: '第一版支持 lrclib，用于查询缺失的歌词' },
  lyrics_user_agent: { title: '歌词服务标识', hint: '访问 LRCLIB 时使用的应用标识' },
  default_delete_strategy: { title: '默认保留策略', hint: 'quality、size_desc、size_asc 的组合顺序' },
  scan_depth: { title: '最大扫描深度', hint: '限制目录递归层数，避免扫描到无关挂载目录' },
};

export const SettingsPage = () => {
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [saving, setSaving] = useState(false);

  const loadConfigs = async () => {
    const response = await axios.get<AppConfig[]>(`${API_BASE}/config`);
    setConfigs(response.data);
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const updateValue = (key: string, value: string) => {
    setConfigs(current => current.map(config => config.key === key ? { ...config, value } : config));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(configs.map(config => axios.post(`${API_BASE}/config`, { key: config.key, value: config.value })));
      await loadConfigs();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <span className="settings-page-mark"><Settings2 size={24} /></span>
        <div className="settings-page-heading">
          <h1>设置</h1>
          <p>管理音乐库路径、扫描规则和默认处理策略。</p>
        </div>
        <button className="settings-save-all" onClick={saveAll} disabled={saving}>
          <Save size={16} />{saving ? '保存中…' : '保存全部设置'}
        </button>
      </header>

      <div className="settings-page-note"><FolderCog size={18} />配置只会保存在本机的应用数据中，不会同步到外部服务。</div>

      <div className="settings-list">
        {configs.map(config => {
          const meta = configMeta[config.key] || { title: config.desc || config.key, hint: config.key };
          return (
          <article className="settings-row" key={config.key}>
            <div className="settings-row-copy">
              <h2>{meta.title}</h2>
              <p>{meta.hint}</p>
            </div>
            <div className="settings-row-control">
              <input
                aria-label={meta.title}
                type={config.key === 'mb_api_key' ? 'password' : 'text'}
                autoComplete="off"
                value={config.value}
                onChange={event => updateValue(config.key, event.target.value)}
              />
              {(config.key === 'source_path' || config.key === 'target_path') && (
                <PathBrowser value={config.value} onChange={path => updateValue(config.key, path)} />
              )}
            </div>
          </article>
          );
        })}
      </div>

      <footer className="settings-page-footer">
        <button onClick={loadConfigs}><RotateCcw size={16} />放弃未保存的修改</button>
      </footer>
    </section>
  );
};
