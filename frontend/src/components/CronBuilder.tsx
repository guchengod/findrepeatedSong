import React, { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import cronstrue from 'cronstrue';
import { useTranslation } from 'react-i18next';

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
  onSave?: (cron: string) => void;
}

// Calculate next N run times from a cron expression
const getNextRuns = (cronExpr: string, n: number = 5): Date[] => {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return [];

  const [minStr, hourStr, dayStr, monthStr, dowStr] = parts;
  const results: Date[] = [];
  const now = new Date();

  const parseField = (field: string, min: number, max: number): number[] => {
    if (field === '*') return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    if (field.includes('/')) {
      const [, step] = field.split('/');
      const stepNum = parseInt(step);
      const base = field.startsWith('*') ? min : parseInt(field);
      return Array.from({ length: Math.ceil((max - base) / stepNum) + 1 }, (_, i) => base + i * stepNum);
    }
    if (field.includes(',')) return field.split(',').map(Number);
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return [parseInt(field)];
  };

  const minutes = parseField(minStr, 0, 59);
  const hours = parseField(hourStr, 0, 23);
  const days = parseField(dayStr, 1, 31);
  const months = parseField(monthStr, 1, 12);
  const daysOfWeek = parseField(dowStr, 0, 6);

  const addMinutes = (d: Date, mins: number) => {
    d.setTime(d.getTime() + mins * 60000);
  };

  let current = new Date(now);
  current.setSeconds(0, 0);
  addMinutes(current, 1);

  const maxIterations = 10000;
  let iterations = 0;

  while (results.length < n && iterations < maxIterations) {
    iterations++;
    const m = current.getMonth() + 1;
    const d = current.getDate();
    const dow = current.getDay();
    const h = current.getHours();
    const min = current.getMinutes();

    if (months.includes(m) && days.includes(d) && daysOfWeek.includes(dow)) {
      if (h === hours[Math.min(h, hours.length - 1)] && min === minutes[Math.min(min, minutes.length - 1)]) {
        results.push(new Date(current));
        addMinutes(current, 1);
        continue;
      }
    }
    addMinutes(current, 1);
  }

  return results;
};

export const CronBuilder: React.FC<CronBuilderProps> = ({ value, onChange, onSave }) => {
  const { t } = useTranslation();
  const [cron, setCron] = useState(value || '0 0 * * *');
  const [humanReadable, setHumanReadable] = useState('');
  const [nextRuns, setNextRuns] = useState<Date[]>([]);
  // qnn-react-cron is CJS — load dynamically so Vite bundles it via its ESM interop
  const [CronEditor, setCronEditor] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    import('qnn-react-cron').then(m => {
      // CJS module.exports becomes default export in ESM interop
      setCronEditor(() => (m as { default: React.ComponentType<Record<string, unknown>> }).default);
    });
  }, []);

  const PRESETS = [
    { label: t('cronBuilder.everyMinute'), value: '* * * * *' },
    { label: t('cronBuilder.every5Minutes'), value: '*/5 * * * *' },
    { label: t('cronBuilder.everyHour'), value: '0 * * * *' },
    { label: t('cronBuilder.dailyMidnight'), value: '0 0 * * *' },
    { label: t('cronBuilder.daily2AM'), value: '0 2 * * *' },
    { label: t('cronBuilder.weeklySunday'), value: '0 0 * * 0' },
    { label: t('cronBuilder.monthly'), value: '0 0 1 * *' },
  ];

  useEffect(() => {
    setCron(value);
  }, [value]);

  useEffect(() => {
    try {
      setHumanReadable(cronstrue.toString(cron, { throwExceptionOnParseError: false }));
      setNextRuns(getNextRuns(cron, 5));
    } catch (e) {
      setHumanReadable('Invalid expression');
      setNextRuns([]);
    }
  }, [cron]);

  // Debounced auto-save when cron changes
  useEffect(() => {
    if (!onSave) return;
    const timer = setTimeout(() => {
      onSave(cron);
    }, 2000);
    return () => clearTimeout(timer);
  }, [cron, onSave]);

  const handlePresetClick = (presetValue: string) => {
    setCron(presetValue);
    onChange(presetValue);
  };

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handlePresetClick(preset.value)}
            className="cb-btn"
            style={{
              padding: '0.3rem 0.6rem',
              fontSize: '10px',
              background: cron === preset.value ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
              borderColor: cron === preset.value ? '#00f0ff' : 'rgba(0, 240, 255, 0.2)',
              color: cron === preset.value ? '#00f0ff' : '#4a4a6a',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Cron Editor */}
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#00f0ff',
            borderRadius: 4,
          },
        }}
      >
        <div style={{
          background: 'rgba(10, 10, 15, 0.8)',
          border: '1px solid rgba(0, 240, 255, 0.15)',
          borderRadius: '8px',
          padding: '1rem',
        }}>
          {CronEditor ? (
            <CronEditor
              value={cron}
              onOk={(v: string) => {
                setCron(v);
                onChange(v);
              }}
              panesShow={{
                second: false,
                minute: true,
                hour: true,
                day: true,
                month: true,
                week: true,
                year: false,
              }}
              defaultTab="minute"
              footer={false}
            />
          ) : (
            <div className="text-[#4a4a6a] text-xs font-mono py-4 text-center">Loading cron editor...</div>
          )}
        </div>
      </ConfigProvider>

      {/* Human readable */}
      {humanReadable && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px',
          color: '#00f0ff',
          padding: '0.5rem 0.75rem',
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid rgba(0, 240, 255, 0.1)',
          borderRadius: '4px',
        }}>
          {'//'} {humanReadable}
        </div>
      )}

      {/* Next 5 runs */}
      {nextRuns.length > 0 && (
        <div className="space-y-1">
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#4a4a6a',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.25rem',
          }}>
            {t('cronBuilder.next5Runs')}
          </div>
          {nextRuns.map((run, i) => (
            <div
              key={i}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                color: '#39ff14',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ color: '#4a4a6a' }}>#{i + 1}</span>
              {run.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
