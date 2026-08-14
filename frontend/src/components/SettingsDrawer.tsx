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
  default_delete_strategy: { title: '默认保留策略', hint: 'quality、size_desc、size_asc 的组合顺序' },
  scan_depth: { title: '最大扫描深度', hint: '限制目录递归层数，避免扫描到无关挂载目录' },
};

export const SettingsPage = () => {
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  const saveConfig = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await axios.post(`${API_BASE}/config`, { key, value });
      await loadConfigs();
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <span className="settings-page-mark"><Settings2 size={24} /></span>
        <div>
          <h1>设置</h1>
          <p>管理音乐库路径、扫描规则和默认处理策略。</p>
        </div>
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
                type="text"
                value={config.value}
                onChange={event => updateValue(config.key, event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') saveConfig(config.key, config.value);
                }}
              />
              {(config.key === 'source_path' || config.key === 'target_path') && (
                <PathBrowser value={config.value} onChange={path => updateValue(config.key, path)} />
              )}
              <button className="settings-save" onClick={() => saveConfig(config.key, config.value)} disabled={savingKey === config.key}>
                <Save size={16} />{savingKey === config.key ? '保存中…' : '保存'}
              </button>
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
