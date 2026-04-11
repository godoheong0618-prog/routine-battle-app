import { Link } from 'react-router-dom';
import ProgressBar from '../ui/ProgressBar';
import ProgressRing from '../ui/ProgressRing';
import SectionHeader from '../ui/SectionHeader';
import { formatRoutineSchedule, RoutineRow, RoutineStatus, SharedGoalRow } from '../../lib/mvp';

type PersonalGoalView = RoutineRow & {
  status: RoutineStatus;
  note: string;
};

type SharedGoalCard = SharedGoalRow & {
  myPercent: number;
  friendPercent: number;
};

type RoutineFeedbackState = Record<string, { id: number; status: Exclude<RoutineStatus, 'pending'> }>;

type WeekStatDay = {
  dateKey: string;
  status: string;
  percent: number;
};

type HomeDashboardContentProps = {
  isKo: boolean;
  todayLabel: string;
  greetingCopy: string;
  profileLabel: string;
  friendLabel: string;
  battleTeaserHref: string;
  battleTeaserTitle: string;
  battleTeaserBody: string;
  completedCount: number;
  totalCount: number;
  streak: number;
  completionRate: number;
  friendProfileExists: boolean;
  myTodayCompletedCount: number;
  friendTodayCompletedCount: number;
  todayKey: string;
  myPageAriaLabel: string;
  groupedGoals: Array<{
    key: string;
    label: string;
    items: PersonalGoalView[];
  }>;
  weekDaily: WeekStatDay[];
  sharedGoalCards: SharedGoalCard[];
  statusLabels: Record<RoutineStatus, string>;
  screenLocale: string;
  pendingAction: string;
  noteDrafts: Record<string, string>;
  expandedNotes: Record<string, boolean>;
  routineFeedback: RoutineFeedbackState;
  routineStreakMap: Record<string, number>;
  onOpenCreateSheet: () => void;
  onOpenEditSheet: (routine: RoutineRow) => void;
  onCyclePriority: (routine: RoutineRow) => void;
  onSetRoutineStatus: (routineId: string, status: RoutineStatus, options?: { toggleSame?: boolean; silentFeedback?: boolean }) => void;
  onDeleteRoutine: (routineId: string) => void;
  onToggleNote: (routineId: string) => void;
  onNoteDraftChange: (routineId: string, value: string) => void;
  onNoteBlur: (goal: PersonalGoalView) => void;
  getRoutineFeedbackLabel: (status: Exclude<RoutineStatus, 'pending'>) => string;
};

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="service-inline-icon">
      <path d="M12 8.75A3.25 3.25 0 1 0 12 15.25A3.25 3.25 0 1 0 12 8.75Z" />
      <path d="M5.95 7.58 4.5 10l1.45 2.42 2.73.37 1.22 2.37 2.6.23 1.95-1.74 2.56.69 1.8-1.87-.64-2.63 1.59-2.12L18.85 5l-2.72.32-2-1.66-2.58.3-1.15 2.35-2.45.27Z" />
    </svg>
  );
}

function getWeekdayLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${dateKey}T12:00:00`));
}

function getDateNumberLabel(dateKey: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));
}

export default function HomeDashboardContent({
  isKo,
  todayLabel,
  greetingCopy,
  profileLabel,
  friendLabel,
  battleTeaserHref,
  battleTeaserTitle,
  battleTeaserBody,
  completedCount,
  totalCount,
  streak,
  completionRate,
  friendProfileExists,
  myTodayCompletedCount,
  friendTodayCompletedCount,
  todayKey,
  myPageAriaLabel,
  groupedGoals,
  weekDaily,
  sharedGoalCards,
  statusLabels,
  screenLocale,
  pendingAction,
  noteDrafts,
  expandedNotes,
  routineFeedback,
  routineStreakMap,
  onOpenCreateSheet,
  onOpenEditSheet,
  onCyclePriority,
  onSetRoutineStatus,
  onDeleteRoutine,
  onToggleNote,
  onNoteDraftChange,
  onNoteBlur,
  getRoutineFeedbackLabel,
}: HomeDashboardContentProps) {
  return (
    <>
      <header className="service-page-header service-home-header">
        <div className="service-page-header-copy">
          <p className="service-page-date">{todayLabel}</p>
          <h1>
            {greetingCopy}, {profileLabel}
          </h1>
        </div>

        <Link className="service-icon-button" to="/mypage" aria-label={myPageAriaLabel}>
          <SettingsIcon />
        </Link>
      </header>

      <main className="service-page-content service-home-content">
        <section className="service-card service-home-progress-card">
          <ProgressRing
            value={completionRate}
            size={92}
            strokeWidth={8}
            label={isKo ? '오늘 진행률' : 'Today progress'}
          />

          <div className="service-home-progress-copy">
            <div className="service-home-streak-row">
              <span className="service-flame-dot" aria-hidden="true">
                ◔
              </span>
              <strong>{isKo ? `${streak}일 연속` : `${streak} day streak`}</strong>
            </div>
            <p>{isKo ? `오늘 ${completedCount}/${totalCount}개 완료` : `${completedCount}/${totalCount} done today`}</p>
          </div>

          <span className="service-home-progress-bubble" aria-hidden="true" />
        </section>

        <Link className="service-home-battle-banner" to={battleTeaserHref}>
          <div className="service-home-battle-copy">
            <span className="service-home-battle-badges">
              <i>😊</i>
              <i>🦊</i>
            </span>
            <div>
              <strong>
                {friendProfileExists
                  ? `${friendLabel}${isKo ? '님과 배틀 중' : ' battle live'}`
                  : isKo
                    ? '친구와 배틀 시작하기'
                    : 'Start a battle with a friend'}
              </strong>
              <p>{battleTeaserTitle}</p>
            </div>
          </div>
          <div className="service-home-battle-score">
            <strong>{myTodayCompletedCount}</strong>
            <span>vs</span>
            <strong>{friendProfileExists ? friendTodayCompletedCount : 0}</strong>
          </div>
        </Link>

        <section className="service-week-strip" aria-label={isKo ? '이번 주 상태' : 'This week status'}>
          {weekDaily.map((day) => (
            <article
              key={day.dateKey}
              className={day.dateKey === todayKey ? 'service-week-pill service-week-pill-active' : 'service-week-pill'}
            >
              <span>{getWeekdayLabel(day.dateKey, screenLocale)}</span>
              <strong className={`service-week-pill-mark service-week-pill-mark-${day.status}`}>
                {day.status === 'done' ? '✓' : day.status === 'partial' ? '◐' : day.status === 'rest' ? '−' : day.percent > 0 ? day.percent : '○'}
              </strong>
              <small>{getDateNumberLabel(day.dateKey, screenLocale)}</small>
            </article>
          ))}
        </section>

        <section className="service-section-block">
          <SectionHeader title={isKo ? '오늘의 루틴' : 'Today routines'} actionLabel={isKo ? '+ 추가' : '+ Add'} onAction={onOpenCreateSheet} />

          {groupedGoals.length === 0 ? (
            <article className="service-card service-empty-card">
              <h3>{isKo ? '오늘 보여줄 루틴이 없어요.' : 'Nothing scheduled for today.'}</h3>
              <p>
                {isKo
                  ? '반복 요일이나 시간을 정해 루틴을 만들면 이 화면에서 바로 체크할 수 있어요.'
                  : 'Add a routine with repeat days or a reminder time and it will show up here.'}
              </p>
              <button className="service-text-link" type="button" onClick={onOpenCreateSheet}>
                {isKo ? '루틴 추가하기' : 'Add routine'}
              </button>
            </article>
          ) : (
            <div className="service-routine-groups">
              {groupedGoals.map((group) => (
                <section key={group.key} className="service-routine-group">
                  <div className="service-group-label-row">
                    <h3>{group.label}</h3>
                    <span>{group.items.length}</span>
                  </div>

                  <div className="service-routine-list">
                    {group.items.map((goal) => {
                      const formattedTime = goal.reminder_time
                        ? new Intl.DateTimeFormat(screenLocale, {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          }).format(new Date(`2026-01-01T${goal.reminder_time}:00`))
                        : '';
                      const scheduleLabel = formatRoutineSchedule(goal);
                      const streakCount = routineStreakMap[goal.id] ?? 0;
                      const noteButtonLabel = expandedNotes[goal.id]
                        ? isKo
                          ? '메모 닫기'
                          : 'Hide note'
                        : goal.note
                          ? isKo
                            ? '메모 보기'
                            : 'View note'
                          : isKo
                            ? '메모 추가'
                            : 'Add note';
                      const timeCopy = formattedTime || scheduleLabel;

                      return (
                        <article key={goal.id} className="service-card service-routine-card">
                          {routineFeedback[goal.id] ? (
                            <span className={`dashboard-routine-feedback dashboard-routine-feedback-${routineFeedback[goal.id].status}`}>
                              {getRoutineFeedbackLabel(routineFeedback[goal.id].status)}
                            </span>
                          ) : null}

                          <div className="service-routine-card-main">
                            <button
                              className={goal.status === 'done' ? 'service-check-button service-check-button-active' : 'service-check-button'}
                              type="button"
                              onClick={() => onSetRoutineStatus(goal.id, goal.status === 'done' ? 'pending' : 'done', { toggleSame: false })}
                              disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                              aria-label={goal.status === 'done' ? `${goal.title} undo` : `${goal.title} done`}
                            >
                              <span>{goal.status === 'done' ? '✓' : ''}</span>
                            </button>

                            <div className="service-routine-card-copy">
                              <div className="service-routine-card-head">
                                <div>
                                  <div className="service-routine-title-line">
                                    <h3>{goal.title}</h3>
                                    {goal.category === 'battle' ? (
                                      <span className="service-tag">{isKo ? '배틀' : 'Battle'}</span>
                                    ) : null}
                                  </div>
                                  <p>{timeCopy}</p>
                                </div>

                                <details className="task-menu task-menu-floating">
                                  <summary className="task-menu-trigger" aria-label={isKo ? `${goal.title} 메뉴` : `${goal.title} menu`}>
                                    <span />
                                    <span />
                                    <span />
                                  </summary>

                                  <div className="task-menu-popover">
                                    <button className="task-menu-item" type="button" onClick={() => onOpenEditSheet(goal)}>
                                      {isKo ? '수정' : 'Edit'}
                                    </button>
                                    <button
                                      className="task-menu-item"
                                      type="button"
                                      onClick={() => onCyclePriority(goal)}
                                      disabled={pendingAction === `priority-${goal.id}`}
                                    >
                                      {isKo ? '우선순위 변경' : 'Change priority'}
                                    </button>
                                    <button
                                      className="task-menu-item"
                                      type="button"
                                      onClick={() => onSetRoutineStatus(goal.id, 'pending', { toggleSame: false })}
                                      disabled={pendingAction === `routine-${goal.id}`}
                                    >
                                      {isKo ? '상태 초기화' : 'Reset status'}
                                    </button>
                                    <button
                                      className="task-menu-item task-menu-item-danger"
                                      type="button"
                                      onClick={() => onDeleteRoutine(goal.id)}
                                      disabled={pendingAction === `delete-${goal.id}`}
                                    >
                                      {pendingAction === `delete-${goal.id}` ? (isKo ? '삭제 중...' : 'Deleting...') : isKo ? '삭제' : 'Delete'}
                                    </button>
                                  </div>
                                </details>
                              </div>

                              <div className="service-routine-card-meta">
                                <span className={`service-status-chip service-status-chip-${goal.status}`}>{statusLabels[goal.status]}</span>
                                {streakCount > 0 ? (
                                  <span className="service-meta-chip">{isKo ? `${streakCount}일 연속` : `${streakCount} day streak`}</span>
                                ) : null}
                                <span className="service-meta-chip">{scheduleLabel}</span>
                              </div>
                            </div>
                          </div>

                          <div className="service-routine-actions">
                            {(['partial', 'rest'] as const).map((status) => (
                              <button
                                key={status}
                                className={goal.status === status ? 'service-action-chip service-action-chip-active' : 'service-action-chip'}
                                type="button"
                                onClick={() => onSetRoutineStatus(goal.id, status)}
                                disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                              >
                                {pendingAction === `routine-${goal.id}` ? (isKo ? '저장 중...' : 'Saving...') : statusLabels[status]}
                              </button>
                            ))}

                            <button
                              className={expandedNotes[goal.id] ? 'service-action-chip service-action-chip-active' : 'service-action-chip'}
                              type="button"
                              onClick={() => onToggleNote(goal.id)}
                            >
                              {noteButtonLabel}
                            </button>
                          </div>

                          {expandedNotes[goal.id] ? (
                            <label className="service-note-field" htmlFor={`routine-note-${goal.id}`}>
                              <input
                                id={`routine-note-${goal.id}`}
                                type="text"
                                placeholder={isKo ? '짧은 메모를 남겨보세요.' : 'Add a short note'}
                                value={noteDrafts[goal.id] ?? goal.note}
                                onChange={(event) => onNoteDraftChange(goal.id, event.target.value)}
                                onBlur={() => onNoteBlur(goal)}
                                disabled={pendingAction === `routine-${goal.id}` || pendingAction === `delete-${goal.id}`}
                                maxLength={80}
                              />
                            </label>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="service-section-block">
          <SectionHeader
            title={isKo ? '공동 목표' : 'Shared goals'}
            actionLabel={isKo ? '+ 추가' : '+ Add'}
            actionTo={friendProfileExists ? '/battle' : '/friends'}
          />

          {!friendProfileExists ? (
            <article className="service-card service-empty-card">
              <h3>{isKo ? '아직 연결된 친구가 없어요.' : 'No friend connected yet.'}</h3>
              <p>
                {isKo
                  ? '친구를 연결하면 함께 체크하는 목표와 진행률을 이 영역에서 따로 볼 수 있어요.'
                  : 'Connect a friend to keep shared goals and progress in a separate area.'}
              </p>
              <Link className="service-text-link" to="/friends">
                {isKo ? '친구 연결하기' : 'Open Friends'}
              </Link>
            </article>
          ) : sharedGoalCards.length === 0 ? (
            <article className="service-card service-empty-card">
              <h3>{isKo ? '진행 중인 공동 목표가 없어요.' : 'No shared goals yet.'}</h3>
              <p>
                {isKo
                  ? '배틀 화면에서 공동 목표를 만들면 여기에서 진행률과 오늘 완료 상태를 바로 볼 수 있어요.'
                  : 'Create a shared goal in Battle and it will preview here with progress bars.'}
              </p>
              <Link className="service-text-link" to="/battle">
                {isKo ? '공동 목표 만들기' : 'Open battle'}
              </Link>
            </article>
          ) : (
            <div className="service-shared-goal-list">
              {sharedGoalCards.map((goal) => (
                <article key={goal.id} className="service-card service-shared-goal-card">
                  <div className="service-shared-goal-head">
                    <div className="service-shared-goal-icon">◎</div>
                    <div>
                      <h3>{goal.title}</h3>
                      <p>{goal.stake_text || goal.rule_text || goal.description || battleTeaserBody}</p>
                    </div>
                  </div>

                  <div className="service-shared-progress-block">
                    <div className="service-progress-label-row">
                      <span>{isKo ? '나' : 'Me'}</span>
                      <strong>{goal.myPercent}%</strong>
                    </div>
                    <ProgressBar value={goal.myPercent} />
                  </div>

                  <div className="service-shared-progress-block">
                    <div className="service-progress-label-row">
                      <span>{friendLabel}</span>
                      <strong>{goal.friendPercent}%</strong>
                    </div>
                    <ProgressBar value={goal.friendPercent} tone="muted" />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
