import { useEffect, useMemo, useState } from 'react';
import BottomTabBar from '../components/BottomTabBar';
import RoutineEditorSheet from '../components/RoutineEditorSheet';
import { useLanguage } from '../i18n/LanguageContext';
import {
  ProfileRow,
  PriorityQuadrant,
  RoutineRow,
  ensureProfile,
  formatRoutinePriority,
  formatRoutineSchedule,
  getRoutinePriorityQuadrant,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

const QUADRANTS: Array<{ key: PriorityQuadrant; titleKo: string; titleEn: string; hintKo: string; hintEn: string }> = [
  { key: 'do', titleKo: '지금 하기', titleEn: 'Do now', hintKo: '중요하고 긴급', hintEn: 'Important and urgent' },
  { key: 'schedule', titleKo: '계획하기', titleEn: 'Schedule', hintKo: '중요하지만 여유 있음', hintEn: 'Important, not urgent' },
  { key: 'delegate', titleKo: '가볍게 처리', titleEn: 'Quick handle', hintKo: '긴급하지만 덜 중요', hintEn: 'Urgent, less important' },
  { key: 'later', titleKo: '나중에', titleEn: 'Later', hintKo: '급하지 않음', hintEn: 'Not urgent' },
];

export default function Focus() {
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [editingRoutine, setEditingRoutine] = useState<RoutineRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { locale, t } = useLanguage();
  const isKo = locale === 'ko';

  useEffect(() => {
    let active = true;

    const loadFocus = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await ensureProfile(user);
        const { data, error: routinesError } = await supabase
          .from('routines')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (routinesError) {
          throw routinesError;
        }

        if (active) {
          setUserId(user.id);
          setProfile(nextProfile);
          setRoutines(((data as RoutineRow[]) ?? []).filter((routine) => !routine.is_template));
        }
      } catch (loadError) {
        console.warn('Focus load failed:', loadError);
        if (active) {
          setError(isKo ? '우선순위 보드를 불러오지 못했어요.' : 'Could not load focus board.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadFocus();

    return () => {
      active = false;
    };
  }, [isKo]);

  const routinesByQuadrant = useMemo(() => {
    return QUADRANTS.reduce<Record<PriorityQuadrant, RoutineRow[]>>(
      (result, quadrant) => {
        result[quadrant.key] = routines.filter((routine) => getRoutinePriorityQuadrant(routine) === quadrant.key);
        return result;
      },
      { do: [], schedule: [], delegate: [], later: [] }
    );
  }, [routines]);

  const handleRoutineSaved = (routine: RoutineRow) => {
    setRoutines((current) => {
      const exists = current.some((item) => item.id === routine.id);
      return exists ? current.map((item) => (item.id === routine.id ? routine : item)) : [routine, ...current];
    });
  };

  const handleToggleFlag = async (routine: RoutineRow, flag: 'important' | 'urgent') => {
    if (!userId) {
      return;
    }

    const patch = { [flag]: !routine[flag] };
    const { data, error: saveError } = await supabase
      .from('routines')
      .update(patch)
      .eq('id', routine.id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (saveError) {
      setError(isKo ? '우선순위를 저장하지 못했어요.' : 'Could not save priority.');
      return;
    }

    setRoutines((current) => current.map((item) => (item.id === routine.id ? (data as RoutineRow) : item)));
  };

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen subpage-screen focus-screen">
        <header className="subpage-header">
          <p className="section-eyebrow">Focus</p>
          <h1>{isKo ? '오늘의 우선순위' : 'Today focus board'}</h1>
          <p>
            {isKo
              ? '홈은 체크에 집중하고, 정리는 여기서 가볍게 해요.'
              : 'Keep Today simple and sort priorities here.'}
          </p>
        </header>

        <main className="subpage-content focus-content">
          {error && <p className="error home-error">{error}</p>}

          <div className="focus-summary-card">
            <span>{profile?.nickname || (isKo ? '나' : 'Me')}</span>
            <strong>{isKo ? `${routines.length}개 루틴 정리 중` : `${routines.length} routines sorted`}</strong>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditingRoutine(null);
                setSheetOpen(true);
              }}
            >
              {isKo ? '루틴 추가' : 'Add routine'}
            </button>
          </div>

          <section className="focus-board">
            {QUADRANTS.map((quadrant) => (
              <article
                key={quadrant.key}
                className={`focus-column focus-column-${quadrant.key}${
                  routinesByQuadrant[quadrant.key].length === 0 ? ' focus-column-empty' : ''
                }`}
              >
                <div className="focus-column-header">
                  <div>
                    <h2>{isKo ? quadrant.titleKo : quadrant.titleEn}</h2>
                    <p>{isKo ? quadrant.hintKo : quadrant.hintEn}</p>
                  </div>
                  <span>{routinesByQuadrant[quadrant.key].length}</span>
                </div>

                {routinesByQuadrant[quadrant.key].length === 0 ? (
                  <p className="focus-empty">{isKo ? '여기는 비어 있어요.' : 'Nothing here yet.'}</p>
                ) : (
                  <div className="focus-routine-list">
                    {routinesByQuadrant[quadrant.key].map((routine) => (
                      <div key={routine.id} className="focus-routine-card">
                        <div className="focus-routine-top">
                          <div>
                            <h3>{routine.title}</h3>
                            <p>{routine.description || formatRoutineSchedule(routine)}</p>
                          </div>
                          <button
                            className="task-menu-trigger"
                            type="button"
                            onClick={() => {
                              setEditingRoutine(routine);
                              setSheetOpen(true);
                            }}
                            aria-label={isKo ? `${routine.title} 수정` : `Edit ${routine.title}`}
                          >
                            <span />
                            <span />
                            <span />
                          </button>
                        </div>

                        <p className="focus-priority-label">{formatRoutinePriority(routine)}</p>

                        <div className="focus-toggle-row">
                          <button
                            className={routine.important ? 'focus-toggle-active' : ''}
                            type="button"
                            onClick={() => handleToggleFlag(routine, 'important')}
                          >
                            {isKo ? '중요' : 'Important'}
                          </button>
                          <button
                            className={routine.urgent ? 'focus-toggle-active' : ''}
                            type="button"
                            onClick={() => handleToggleFlag(routine, 'urgent')}
                          >
                            {isKo ? '긴급' : 'Urgent'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        </main>

        {sheetOpen && (
          <RoutineEditorSheet
            initialRoutine={editingRoutine}
            onClose={() => setSheetOpen(false)}
            onSaved={handleRoutineSaved}
          />
        )}

        <BottomTabBar />
      </div>
    </div>
  );
}
