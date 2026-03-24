import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PathBrowser } from './PathBrowser';

const API_BASE = '/api';

interface AppConfig {
  key: string;
  value: string;
  desc: string;
}

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfigs();
    }
  }, [open]);

  const loadConfigs = async () => {
    const res = await axios.get(`${API_BASE}/config`);
    setConfigs(res.data);
  };

  const updateConfig = async (key: string, value: string) => {
    setSaving(true);
    await axios.post(`${API_BASE}/config`, { key, value });
    setSaving(false);
    loadConfigs();
  };

  const handleSave = async (key: string, value: string) => {
    await updateConfig(key, value);
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 999,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '400px',
        maxWidth: '100vw',
        background: 'rgba(10, 10, 15, 0.98)',
        borderLeft: '1px solid rgba(0, 240, 255, 0.15)',
        zIndex: 1000,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        backdropFilter: 'blur(20px)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid rgba(0, 240, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              color: '#00f0ff',
              textShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
              margin: 0,
            }}>
              {t('settings.title')}
            </h2>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#4a4a6a',
              margin: '0.25rem 0 0',
            }}>
              // {t('settings.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '4px',
              color: '#4a4a6a',
              cursor: 'pointer',
              padding: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Config Fields */}
        <div style={{ padding: '1.5rem', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {configs.map((conf) => (
              <div key={conf.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#4a4a6a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}>
                  {conf.desc || conf.key}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={conf.value}
                    onChange={(e) => {
                      const newConfigs = configs.map(c =>
                        c.key === conf.key ? { ...c, value: e.target.value } : c
                      );
                      setConfigs(newConfigs);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const c = configs.find(c => c.key === conf.key);
                        if (c) handleSave(c.key, c.value);
                      }
                    }}
                    className="cb-input"
                    style={{ flex: 1 }}
                  />
                  {(conf.key === 'source_path' || conf.key === 'target_path') && (
                    <PathBrowser
                      value={conf.value}
                      onChange={(path) => {
                        const newConfigs = configs.map(c =>
                          c.key === conf.key ? { ...c, value: path } : c
                        );
                        setConfigs(newConfigs);
                        handleSave(conf.key, path);
                      }}
                    />
                  )}
                  <button
                    onClick={() => handleSave(conf.key, conf.value)}
                    disabled={saving}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(0, 240, 255, 0.3)',
                      borderRadius: '4px',
                      color: '#00f0ff',
                      cursor: 'pointer',
                      padding: '0.4rem 0.6rem',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '10px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700,
                    }}
                  >
                    <Save size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(0, 240, 255, 0.1)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
        }}>
          <button
            onClick={loadConfigs}
            style={{
              background: 'transparent',
              border: '1px solid rgba(74, 74, 106, 0.5)',
              borderRadius: '4px',
              color: '#4a4a6a',
              cursor: 'pointer',
              padding: '0.4rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <RotateCcw size={11} />
            {t('settings.reset')}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '4px',
              color: '#00f0ff',
              cursor: 'pointer',
              padding: '0.4rem 0.75rem',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
            }}
          >
            {t('settings.close')}
          </button>
        </div>
      </div>
    </>
  );
};
