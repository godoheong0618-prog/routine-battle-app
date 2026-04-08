import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  EVERYDAY_KEYS,
  ROUTINE_TEMPLATES,
  RoutineCategory,
  RoutineDayKey,
  RoutineRow,
  WEEKDAY_KEYS,
  WEEKDAY_OPTIONS,
  WEEKEND_KEYS,
  formatDaysOfWeek,
  getRoutineRepeatDays,
  normalizeRoutineCategory,
} from '../lib/mvp';
import { supabase } from '../supabaseClient';

type RepeatMode = 'daily' | 'specific_days';
type CreateMode = 'custom' | 'template';

type RoutineEditorSheetProps = {
  initialRoutine?: RoutineRow | null;
  onClose: () => void;
  onSaved: (routine: RoutineRow) => void;
};

export default function RoutineEditorSheet({ initialRoutine, onClose, onSaved }: RoutineEditorSheetProps) {
  const isEditMode = Boolean(initialRoutine?.id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('daily');
  const [selectedDays, setSelectedDays] = useState<RoutineDayKey[]>([]);
  const [reminderTime, setReminderTime] = useState('');
  const [important, setImportant] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [category, setCategory] = useState<RoutineCategory>('personal');
  const [createMode, setCreateMode] = useState<CreateMode>('custom');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialRoutine) {
      setTitle('');
      setDescription('');
      setRepeatMode('daily');
      setSelectedDays([]);
      setReminderTime('');
      setImportant(false);
      setUrgent(false);
      setCategory('personal');
      setCreateMode('custom');
      setSelectedTemplateId('');
      setError('');
      return;
    }

    const repeatDays = getRoutineRepeatDays(initialRoutine);

    setTitle(initialRoutine.title);
    setDescription(initialRoutine.description ?? '');
    setRepeatMode(initialRoutine.schedule_type === 'specific_days' ? 'specific_days' : 'daily');
    setSelectedDays(repeatDays);
    setReminderTime(initialRoutine.reminder_time ?? '');
    setImportant(Boolean(initialRoutine.important));
    setUrgent(Boolean(initialRoutine.urgent));
    setCategory(normalizeRoutineCategory(initialRoutine.category));
    setCreateMode('custom');
    setSelectedTemplateId('');
    setError('');
  }, [initialRoutine]);

  const repeatText = useMemo(() => {
    if (repeatMode === 'daily') {
      return '매일';
    }

    return selectedDays.length > 0 ? formatDaysOfWeek(selectedDays) : '직접 선택';
  }, [repeatMode, selectedDays]);

  const applyRepeatPreset = (days: RoutineDayKey[]) => {
    if (days.length === EVERYDAY_KEYS.length) {
      setRepeatMode('daily');
      setSelectedDays([]);
      return;
    }

    setRepeatMode('specific_days');
    setSelectedDays(days);
  };

  const toggleDay = (dayKey: RoutineDayKey) => {
    setRepeatMode('specific_days');
    setSelectedDays((current) =>
      current.includes(dayKey) ? current.filter((day) => day !== dayKey) : [...current, dayKey]
    );
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
    setReminderTime(template.reminder_time ?? '');
    applyRepeatPreset(template.repeat_days);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const nextTitle = title.trim();

    if (!nextTitle) {
      setError('제목을 입력해 주세요.');
      return;
    }

    if (repeatMode === 'specific_days' && selectedDays.length === 0) {
      setError('반복 요일을 하나 이상 선택해 주세요.');
      return;
    }

    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError(userError?.message || '로그인이 필요합니다.');
      setSaving(false);
      return;
    }

    const payload = {
      user_id: initialRoutine?.user_id ?? user.id,
      title: nextTitle,
      description: description.trim() || null,
      frequency: repeatMode === 'daily' ? 'daily' : 'weekly',
      target_count: initialRoutine?.target_count ?? 1,
      schedule_type: repeatMode,
      days_of_week: repeatMode === 'specific_days' ? selectedDays : [],
      repeat_days: repeatMode === 'specific_days' ? selectedDays : EVERYDAY_KEYS,
      reminder_time: reminderTime || null,
      important,
      urgent,
      category,
      created_by: initialRoutine?.created_by ?? user.id,
      is_template: false,
    };

    const query = isEditMode
      ? supabase.from('routines').update(payload).eq('id', initialRoutine?.id).eq('user_id', user.id)
      : supabase.from('routines').insert(payload);

    const { data, error: saveError } = await query.select('*').single();

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    onSaved(data as RoutineRow);
    setSaving(false);
    onClose();
  };

  return (
    <div className="routine-sheet-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <section
        className="routine-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="routine-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="routine-sheet-handle" />
        <div className="routine-sheet-header">
          <div>
            <p className="section-eyebrow">Routine</p>
            <h2 id="routine-sheet-title">{isEditMode ? '루틴 수정' : '루틴 추가'}</h2>
            <p>{repeatText} · {category === 'battle' ? '배틀 루틴' : '개인 루틴'}</p>
          </div>
          <button className="sheet-close-button" type="button" onClick={onClose} disabled={saving}>
            닫기
          </button>
        </div>

        <form className="routine-sheet-form" onSubmit={handleSubmit}>
          {!isEditMode && (
            <div className="sheet-segment">
              <button
                className={createMode === 'custom' ? 'sheet-segment-button sheet-segment-button-active' : 'sheet-segment-button'}
                type="button"
                onClick={() => {
                  setCreateMode('custom');
                  setSelectedTemplateId('');
                }}
              >
                직접 만들기
              </button>
              <button
                className={createMode === 'template' ? 'sheet-segment-button sheet-segment-button-active' : 'sheet-segment-button'}
                type="button"
                onClick={() => setCreateMode('template')}
              >
                템플릿
              </button>
            </div>
          )}

          {createMode === 'template' && !isEditMode && (
            <div className="sheet-template-list">
              {ROUTINE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className={selectedTemplateId === template.id ? 'sheet-template-card sheet-template-card-active' : 'sheet-template-card'}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                >
                  <strong>{template.title}</strong>
                  <span>{formatDaysOfWeek(template.repeat_days)}</span>
                </button>
              ))}
            </div>
          )}

          <label className="field-group" htmlFor="sheet-routine-title">
            <span>제목</span>
            <input
              id="sheet-routine-title"
              type="text"
              value={title}
              placeholder="예: 운동 10분"
              onChange={(event) => setTitle(event.target.value)}
              maxLength={60}
              required
            />
          </label>

          <label className="field-group" htmlFor="sheet-routine-description">
            <span>설명(optional)</span>
            <textarea
              id="sheet-routine-description"
              value={description}
              placeholder="간단한 기준을 적어두면 체크가 쉬워요."
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={140}
            />
          </label>

          <div className="sheet-preset-row" aria-label="반복 요일 프리셋">
            <button type="button" onClick={() => applyRepeatPreset(EVERYDAY_KEYS)}>매일</button>
            <button type="button" onClick={() => applyRepeatPreset(WEEKDAY_KEYS)}>평일</button>
            <button type="button" onClick={() => applyRepeatPreset(WEEKEND_KEYS)}>주말</button>
            <button type="button" onClick={() => setRepeatMode('specific_days')}>직접선택</button>
          </div>

          {repeatMode === 'specific_days' && (
            <div className="weekday-grid sheet-weekday-grid">
              {WEEKDAY_OPTIONS.map((day) => (
                <button
                  key={day.key}
                  className={selectedDays.includes(day.key) ? 'weekday-chip weekday-chip-active' : 'weekday-chip'}
                  type="button"
                  onClick={() => toggleDay(day.key)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          )}

          <label className="field-group" htmlFor="sheet-reminder-time">
            <span>알림 시간(optional)</span>
            <input
              id="sheet-reminder-time"
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
            />
          </label>

          <div className="sheet-toggle-grid">
            <button
              className={important ? 'sheet-toggle-button sheet-toggle-button-active' : 'sheet-toggle-button'}
              type="button"
              onClick={() => setImportant((current) => !current)}
            >
              중요
            </button>
            <button
              className={urgent ? 'sheet-toggle-button sheet-toggle-button-active' : 'sheet-toggle-button'}
              type="button"
              onClick={() => setUrgent((current) => !current)}
            >
              긴급
            </button>
          </div>

          <div className="sheet-segment">
            <button
              className={category === 'personal' ? 'sheet-segment-button sheet-segment-button-active' : 'sheet-segment-button'}
              type="button"
              onClick={() => setCategory('personal')}
            >
              개인 루틴
            </button>
            <button
              className={category === 'battle' ? 'sheet-segment-button sheet-segment-button-active' : 'sheet-segment-button'}
              type="button"
              onClick={() => setCategory('battle')}
            >
              배틀 루틴
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary-button routine-sheet-save" type="submit" disabled={saving}>
            {saving ? '저장 중...' : isEditMode ? '수정 완료' : '추가하기'}
          </button>
        </form>
      </section>
    </div>
  );
}
