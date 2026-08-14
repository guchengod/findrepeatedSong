import { useEffect, useState } from 'react';
import axios from 'axios';
import { FolderCog, Globe2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { PathBrowser } from './PathBrowser';

const API_BASE = '/api';

interface AppConfig {
  key: string;
  value: string;
  desc: string;
}

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

  const saveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(configs.map(config => axios.post(`${API_BASE}/config`, { key: config.key, value: config.value })));
      await loadConfigs();
    } finally {
      setSaving(false);
    }
  };

  const getValue = (key: string) => configs.find(config => config.key === key)?.value || '';
  const updateOrCreate = (key: string, value: string) => {
    setConfigs(current => current.some(config => config.key === key)
      ? current.map(config => config.key === key ? { ...config, value } : config)
      : [...current, { key, value, desc: '' }]);
  };

  return (
    <section className="settings-page">
      <header className="page-heading"><h1>设置</h1><p>配置本地音乐库与在线信息来源。</p></header>

      <section className="settings-group">
        <h2><FolderCog size={25} />本地音乐库</h2>
        <article className="settings-row">
          <div className="settings-row-copy"><h3>默认音乐目录</h3><p>用于工作流和手动浏览的起始目录</p></div>
          <div className="settings-row-control"><input aria-label="默认音乐目录" value={getValue('source_path')} onChange={event => updateOrCreate('source_path', event.target.value)} /><PathBrowser value={getValue('source_path')} onChange={path => updateOrCreate('source_path', path)} /></div>
        </article>
        <article className="settings-row">
          <div className="settings-row-copy"><h3>整理目标目录</h3><p>归档文件将移动或复制到此位置</p></div>
          <div className="settings-row-control"><input aria-label="整理目标目录" value={getValue('target_path')} onChange={event => updateOrCreate('target_path', event.target.value)} /><PathBrowser value={getValue('target_path')} onChange={path => updateOrCreate('target_path', path)} /></div>
        </article>
      </section>

      <section className="settings-group">
        <h2><Globe2 size={25} />在线服务</h2>
        <article className="settings-row">
          <div className="settings-row-copy"><h3>MusicBrainz API</h3><p>用于查询歌曲、专辑和艺术家资料</p></div>
          <div className="settings-row-control"><input aria-label="MusicBrainz API Key" type="password" autoComplete="off" placeholder="未配置" value={getValue('mb_api_key')} onChange={event => updateOrCreate('mb_api_key', event.target.value)} /></div>
        </article>
        <article className="settings-row">
          <div className="settings-row-copy"><h3>歌词来源</h3><p>当前支持 LRCLIB，用于下载缺失歌词</p></div>
          <div className="settings-row-control"><input aria-label="歌词来源" value={getValue('lyrics_provider') || 'lrclib'} onChange={event => updateOrCreate('lyrics_provider', event.target.value)} /></div>
        </article>
      </section>

      <section className="settings-group">
        <h2><ShieldCheck size={25} />安全与文件处理</h2>
        <article className="settings-row"><div className="settings-row-copy"><h3>重名文件</h3><p>发生冲突时跳过并保留处理记录</p></div><span className="settings-static-value">跳过并进入任务记录</span></article>
        <article className="settings-row"><div className="settings-row-copy"><h3>文件操作前确认</h3><p>移动、覆盖或清理前要求再次确认</p></div><span className="settings-enabled"><ShieldCheck size={17} />已启用</span></article>
      </section>

      <footer className="settings-page-footer"><span>所有密钥仅保存在当前设备，不会上传音乐文件或目录信息。</span><div><button onClick={loadConfigs}><RotateCcw size={16} />放弃修改</button><button className="settings-save-all" onClick={saveAll} disabled={saving}><Save size={16} />{saving ? '保存中…' : '保存更改'}</button></div></footer>
    </section>
  );
};
