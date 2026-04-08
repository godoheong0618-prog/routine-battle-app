import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  EVERYDAY_KEYS,
  ROUTINE_TEMPLATES,
  RoutineDayKey,
  RoutineRow,
  WEEKDAY_KEYS,
  WEEKDAY_OPTIONS,
  formatDaysOfWeek,
  getRoutineRepeatDays,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type RepeatMode = 'daily' | 'specific_days';
type CreateMode = 'custom' | 'template';

export default function CreateRoutine() {
  const [searchParams] = useSearchParams();
  const routineId = searchParams.get('id');
  const isEditMode = !!routineId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetCount, setTargetCount] = useState(1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('daily');
  const [selectedDays, setSelectedDays] = useState<RoutineDayKey[]>([]);
  const [createMode, setCreateMode] = useState<CreateMode>('custom');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login');
        return;
      }

      if (!routineId) {
        setInitialLoading(false);
        return;
      }

      const { data, error: routineError } = await supabase
        .from('routines')
        .select('*')
        .eq('id', routineId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (routineError) {
        setError(routineError.message);
        setInitialLoading(false);
        return;
      }

      if (!data) {
        setError('수정할 루틴을 찾지 못했어요.');
        setInitialLoading(false);
        return;
      }

      const routine = data as RoutineRow;
      setTitle(routine.title);
      setDescription(routine.description ?? '');
      setTargetCount(routine.target_count ?? 1);
      setRepeatMode(routine.schedule_type === 'specific_days' ? 'specific_days' : 'daily');
      setSelectedDays(getRoutineRepeatDays(routine));
      setReminderTime(routine.reminder_time ?? '');
      setInitialLoading(false);
    };

    bootstrap();
  }, [navigate, routineId]);

  const previewRepeatText = useMemo(() => {
    if (repeatMode === 'daily') {
      return '매일 반복';
    }

    if (selectedDays.length === 0) {
      return '요일을 선택해주세요';
    }

    return formatDaysOfWeek(selectedDays);
  }, [repeatMode, selectedDays]);

  const toggleDay = (dayKey: RoutineDayKey) => {
    setSelectedDays((current) =>
      current.includes(dayKey) ? current.filter((day) => day !== dayKey) : [...current, dayKey]
    );
  };

  const applyRepeatPreset = (days: RoutineDayKey[]) => {
    if (days.length === EVERYDAY_KEYS.length) {
      setRepeatMode('daily');
      setSelectedDays([]);
      return;
    }

    setRepeatMode('specific_days');
    setSelectedDays(days);
  };

  const applyTemplate = (templateId: string) => {
    const template = ROUTINE_TEMPLATES.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    setCreateMode('template');
    setSelectedTemplateId(template.id);
    setTitle(template.title);
    setDescription(template.description);
    setTargetCount(template.target_count);
    setReminderTime(template.reminder_time ?? '');
    applyRepeatPreset(template.repeat_days);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (repeatMode === 'specific_days' && selectedDays.length === 0) {
      setError('특정 요일을 하나 이상 선택해주세요.');
      return;
    }

    if (!title.trim()) {
      setError('루틴 이름을 입력해주세요.');
      return;
    }

    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || '로그인이 필요합니다.');
      setLoading(false);
      navigate('/login');
      return;
    }

    const payload = {
      user_id: user.id,
      title: title.trim(),
      description: description || null,
      frequency: repeatMode === 'daily' ? 'daily' : 'weekly',
      target_count: targetCount,
      schedule_type: repeatMode,
      days_of_week: repeatMode === 'specific_days' ? selectedDays : [],
      repeat_days: repeatMode === 'specific_days' ? selectedDays : EVERYDAY_KEYS,
      reminder_time: reminderTime || null,
      is_template: false,
    };

    if (isEditMode) {
      const { error: updateError } = await supabase
        .from('routines')
        .update(payload)
        .eq('id', routineId)
        .eq('user_id', user.id);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      navigate('/home');
      return;
    }

    const { error: insertError } = await supabase.from('routines').insert(payload);

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    navigate('/home');
  };

  if (initialLoading) {
    return (
      <div className="mobile-shell">
        <div className="app-screen loading-screen">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="mobile-shell">
      <div className="app-screen create-screen">
        <header className="page-topbar">
          <Link className="back-link" to="/home">
            뒤로
          </Link>
          <span className="page-chip">{isEditMode ? '루틴 수정' : '새 루틴'}</span>
        </header>

        <section className="create-hero">
          <p className="section-eyebrow">Routine Builder</p>
          <h1>{isEditMode ? '기존 루틴을 다듬어볼까요?' : '오늘부터 바로 시작할 루틴을 추가해요'}</h1>
          <p>매일 또는 특정 요일만 반복되도록 설정하고, 목표 횟수와 리마인더까지 가볍게 정리할 수 있어요.</p>
        </section>

        <form className="form-card" onSubmit={handleSubmit}>
          {!isEditMode && (
            <section className="template-mode-card">
              <div className="repeat-toggle">
                <button
                  className={createMode === 'custom' ? 'repeat-option repeat-option-active' : 'repeat-option'}
                  type="button"
                  onClick={() => {
                    setCreateMode('custom');
                    setSelectedTemplateId('');
                  }}
                >
                  직접 만들기
                </button>
                <button
                  className={createMode === 'template' ? 'repeat-option repeat-option-active' : 'repeat-option'}
                  type="button"
                  onClick={() => setCreateMode('template')}
                >
                  템플릿으로 추가
                </button>
              </div>

              {createMode === 'template' && (
                <div className="template-grid">
                  {ROUTINE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      className={
                        selectedTemplateId === template.id
                          ? 'template-card template-card-active'
                          : 'template-card'
                      }
                      type="button"
                      onClick={() => applyTemplate(template.id)}
                    >
                      <strong>{template.title}</strong>
                      <span>{template.description}</span>
                      <em>{formatDaysOfWeek(template.repeat_days)}</em>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          <label className="field-group" htmlFor="routine-title">
            <span>루틴 이름</span>
            <input
              id="routine-title"
              type="text"
              placeholder="예: 공부 30분"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label className="field-group" htmlFor="routine-description">
            <span>설명</span>
            <textarea
              id="routine-description"
              placeholder="언제, 어떻게 할지 간단하게 적어보세요"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>

          <div className="field-row">
            <label className="field-group" htmlFor="routine-target-count">
              <span>목표 횟수</span>
              <input
                id="routine-target-count"
                type="number"
                min="1"
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                required
              />
            </label>

            <label className="field-group" htmlFor="routine-reminder-time">
              <span>리마인더</span>
              <input
                id="routine-reminder-time"
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </label>
          </div>

          <section className="scheduler-card">
            <div className="field-group">
              <span>반복 설정</span>
              <div className="repeat-toggle">
                <button
                  className={repeatMode === 'daily' ? 'repeat-option repeat-option-active' : 'repeat-option'}
                  type="button"
                  onClick={() => applyRepeatPreset(EVERYDAY_KEYS)}
                >
                  매일
                </button>
                <button
                  className={
                    repeatMode === 'specific_days' ? 'repeat-option repeat-option-active' : 'repeat-option'
                  }
                  type="button"
                  onClick={() => setRepeatMode('specific_days')}
                >
                  특정 요일만
                </button>
              </div>
              <div className="repeat-preset-row">
                <button type="button" onClick={() => applyRepeatPreset(EVERYDAY_KEYS)}>
                  매일
                </button>
                <button type="button" onClick={() => applyRepeatPreset(WEEKDAY_KEYS)}>
                  평일
                </button>
                <button type="button" onClick={() => applyRepeatPreset(['mon', 'wed', 'fri'])}>
                  월/수/금
                </button>
              </div>
            </div>

            {repeatMode === 'specific_days' && (
              <div className="field-group">
                <span>요일 선택</span>
                <div className="weekday-grid">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <button
                      key={day.key}
                      className={
                        selectedDays.includes(day.key) ? 'weekday-chip weekday-chip-active' : 'weekday-chip'
                      }
                      type="button"
                      onClick={() => toggleDay(day.key)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="preview-card">
            <p className="preview-label">미리보기</p>
            <h3>{title || '새 루틴 제목'}</h3>
            <p>{description || '루틴 설명이 여기에 보여요.'}</p>
            <div className="preview-meta">
              <span>{previewRepeatText}</span>
              <span>{targetCount}회 목표</span>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? '저장 중...' : isEditMode ? '루틴 수정하기' : '루틴 저장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
