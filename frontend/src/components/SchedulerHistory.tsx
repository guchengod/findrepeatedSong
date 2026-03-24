import React from 'react';
import { useTranslation } from 'react-i18next';

export interface RunRecord {
  id: string;
  timestamp: string;
  status: 'COMPLETE' | 'FAILED';
  duration_ms: number;
  error?: string;
}

interface SchedulerHistoryProps {
  runs: RunRecord[];
  taskName: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

export const SchedulerHistory: React.FC<SchedulerHistoryProps> = ({ runs, taskName }) => {
  const { t } = useTranslation();
  const statusColor = (status: string) => {
    switch (status) {
      case 'COMPLETE': return '#39ff14';
      case 'FAILED': return '#ff2d6a';
      default: return '#ffb800';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'OK';
      case 'FAILED': return 'ERR';
      default: return '???';
    }
  };

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid rgba(0, 240, 255, 0.15)',
      borderRadius: '8px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.5rem 1rem',
        borderBottom: '1px solid rgba(0, 240, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span style={{ color: '#00f0ff', fontWeight: 700 }}>
          {'>'} MISSION LOG: {taskName.toUpperCase().substring(0, 3)}
        </span>
      </div>

      {/* Entries */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {runs.length === 0 ? (
          <div style={{ padding: '1rem', color: '#4a4a6a', fontStyle: 'italic' }}>
            {'>'} {t('schedulerHistory.noHistory')}
          </div>
        ) : (
          runs.map((run, i) => (
            <div
              key={run.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px 1fr 80px 80px',
                gap: '0.5rem',
                padding: '0.4rem 1rem',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                alignItems: 'center',
              }}
            >
              {/* Index */}
              <span style={{ color: '#4a4a6a', fontSize: '9px' }}>
                #{runs.length - i}
              </span>

              {/* ID + Timestamp */}
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  color: statusColor(run.status),
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {run.id}
                </div>
                <div style={{ color: '#4a4a6a', fontSize: '9px' }}>
                  {new Date(run.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Status Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.15rem 0.4rem',
                borderRadius: '3px',
                fontSize: '9px',
                fontWeight: 700,
                background: `${statusColor(run.status)}15`,
                border: `1px solid ${statusColor(run.status)}40`,
                color: statusColor(run.status),
                justifySelf: 'start',
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: statusColor(run.status),
                }} />
                {statusLabel(run.status)}
              </div>

              {/* Duration */}
              <div style={{ color: '#4a4a6a', textAlign: 'right', fontSize: '10px' }}>
                {formatDuration(run.duration_ms)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
