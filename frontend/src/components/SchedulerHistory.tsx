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
  const statusClass = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'is-complete';
      case 'FAILED': return 'is-failed';
      default: return 'is-pending';
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
    <div className="scheduler-history">
      {/* Header */}
      <div className="scheduler-history-header">
        <span>执行记录 · {taskName}</span>
      </div>

      {/* Entries */}
      <div className="scheduler-history-list">
        {runs.length === 0 ? (
          <div className="scheduler-history-empty">
            {t('schedulerHistory.noHistory')}
          </div>
        ) : (
          runs.map((run, i) => (
            <div
              key={run.id}
              className="scheduler-history-row"
            >
              {/* Index */}
              <span className="scheduler-history-index">
                #{runs.length - i}
              </span>

              {/* ID + Timestamp */}
              <div className="scheduler-history-copy">
                <div className={`scheduler-history-id ${statusClass(run.status)}`}>
                  {run.id}
                </div>
                <div>
                  {new Date(run.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Status Badge */}
              <div className={`scheduler-history-status ${statusClass(run.status)}`}>
                <div />
                {statusLabel(run.status)}
              </div>

              {/* Duration */}
              <div className="scheduler-history-duration">
                {formatDuration(run.duration_ms)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
