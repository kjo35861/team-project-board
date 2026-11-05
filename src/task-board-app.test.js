// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./lib/task-repository.js", () => ({ listTasks: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), updateTaskStatus: vi.fn(), deleteTask: vi.fn() }));
vi.mock("./lib/member-repository.js", () => ({ listBoardMembers: vi.fn() }));
import * as tasks from "./lib/task-repository.js";
import { listBoardMembers } from "./lib/member-repository.js";
import { mountTaskBoard } from "./task-board-app.js";
const board = { id: "a", name: "Alpha", owner_id: "u" };
const task = { id: "t", boardId: "a", title: "기획", description: "상세", status: "todo", assigneeId: "u", dueDate: "2026-01-01", createdBy: "u", createdAt: "2026-01-01T00:00:00Z" };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { for(let i=0;i<10;i++) await Promise.resolve(); };
const click = selector => document.querySelector(selector).click();
const submit = () => document.querySelector('#task-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
let app;
beforeEach(() => {
  vi.resetAllMocks();
  document.body.innerHTML = readFileSync('index.html', 'utf8').split('<body>')[1].split('</body>')[0];
  tasks.listTasks.mockResolvedValue([task]);
  listBoardMembers.mockResolvedValue([{ userId: 'u', displayName: '사용자', role: 'owner' }]);
  app = mountTaskBoard({ client: {}, userId: 'u' });
});
afterEach(() => { app?.dispose(); document.body.innerHTML = ''; });
describe('server task screen', () => {
  it('shows loading, roster, filtered results and clears data on board switch', async () => {
    const pending = deferred(); tasks.listTasks.mockReturnValueOnce(pending.promise);
    const loading = app.selectBoard(board);
    expect(document.querySelector('[data-task-list]').textContent).toContain('불러오는 중');
    pending.resolve([task]); await loading;
    expect(document.querySelector('[data-task-id]').textContent).toContain('사용자');
    const search = document.querySelector('#task-search'); search.value='없음'; search.dispatchEvent(new Event('input'));
    expect(document.querySelector('[data-task-list]').textContent).toContain('검색·필터');
    await app.selectBoard(null);
    expect(document.querySelector('[data-task-id]')).toBeNull();
  });
  it('ignores stale loads and stale write failures after switching boards', async () => {
    const pending = deferred(); tasks.listTasks.mockReturnValueOnce(pending.promise);
    const old = app.selectBoard(board);
    tasks.listTasks.mockResolvedValue([]);
    await app.selectBoard({ ...board, id: 'b', name: 'Beta' });
    pending.resolve([task]); await old;
    expect(document.querySelector('[data-task-id]')).toBeNull();
    tasks.listTasks.mockResolvedValue([task]); await app.selectBoard(board);
    click('[data-edit-task]');
    const write = deferred(); tasks.updateTask.mockReturnValueOnce(write.promise); submit();
    tasks.listTasks.mockResolvedValue([]); await app.selectBoard({ ...board, id:'b' });
    write.reject({ code:'network' }); await flush();
    expect(document.querySelector('#task-form-error').hidden).toBe(true);
    expect(document.querySelector('[data-task-id]')).toBeNull();
  });
  it('keeps draft and selected roster assignee on failure and blocks double submission', async () => {
    await app.selectBoard(board); click('[data-edit-task]');
    document.querySelector('#task-title').value='수정 초안';
    const pending = deferred(); tasks.updateTask.mockReturnValueOnce(pending.promise);
    submit(); submit();
    expect(tasks.updateTask).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#task-assignee').value).toBe('u');
    pending.reject({ code:'network' }); await flush();
    expect(document.querySelector('#task-title').value).toBe('수정 초안');
    expect(document.querySelector('#task-dialog').open).toBe(true);
    expect(document.querySelector('[data-task-id]').textContent).toContain('기획');
  });
  it('saves and closes the dialog only after success, changes status and deletes', async () => {
    await app.selectBoard(board);
    click('[data-add-task]');
    document.querySelector('#task-title').value='새 업무';
    tasks.createTask.mockResolvedValue({ ...task, id:'new', title:'새 업무' });
    submit(); await flush();
    expect(document.querySelector('#task-dialog').open).toBe(false);
    expect(document.querySelectorAll('[data-task-id]').length).toBe(2);
    tasks.updateTaskStatus.mockResolvedValue({ ...task, status:'done' });
    const select = document.querySelector('[data-task-status="t"]');
    select.value='done'; select.dispatchEvent(new Event('change', { bubbles:true })); await flush();
    expect(document.querySelector('[data-task-list="done"] [data-task-id="t"]')).not.toBeNull();
    vi.spyOn(window,'confirm').mockReturnValue(true);
    tasks.deleteTask.mockResolvedValue('t'); click('[data-delete-task="t"]'); await flush();
    expect(document.querySelector('[data-task-id="t"]')).toBeNull();
  });
  it('filters today and upcoming tasks while keeping the current project', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    tasks.listTasks.mockResolvedValue([
      { ...task, id:'overdue', dueDate:'2026-11-04' },
      { ...task, id:'today', dueDate:'2026-11-05' },
      { ...task, id:'next', dueDate:'2026-11-06' },
      { ...task, id:'finished', dueDate:'2026-11-05', status:'done' },
    ]);
    await app.selectBoard(board);
    click('[data-task-view="today"]');
    expect(document.querySelector('#board-title').textContent).toBe('오늘');
    expect([...document.querySelectorAll('[data-task-id]')].map(e=>e.dataset.taskId)).toEqual(['overdue','today']);
    click('[data-task-view="upcoming"]');
    expect([...document.querySelectorAll('[data-task-id]')].map(e=>e.dataset.taskId)).toEqual(['next']);
    click('[data-task-view="all"]');
    expect(document.querySelectorAll('[data-task-id]').length).toBe(4);
    vi.useRealTimers();
  });
  it('completion button persists status and returns to the old status after failure', async () => {
    await app.selectBoard(board);
    tasks.updateTaskStatus.mockResolvedValueOnce({ ...task, status:'done' });
    click('[data-toggle-complete="t"]'); await flush();
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith({},'a','t','done');
    expect(document.querySelector('[data-toggle-complete="t"]').getAttribute('aria-pressed')).toBe('true');
    tasks.updateTaskStatus.mockRejectedValueOnce({code:'network'});
    click('[data-toggle-complete="t"]'); await flush();
    expect(document.querySelector('[data-toggle-complete="t"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-task-list="done"] [data-task-id="t"]')).not.toBeNull();
  });
  it('keeps card on failed deletion, supports retry and empty board', async () => {
    tasks.listTasks.mockRejectedValueOnce({ code:'network' }); await app.selectBoard(board);
    expect(document.querySelector('[data-retry-tasks]')).not.toBeNull();
    click('[data-retry-tasks]'); await flush();
    vi.spyOn(window,'confirm').mockReturnValue(false); click('[data-delete-task]');
    expect(tasks.deleteTask).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true); tasks.deleteTask.mockRejectedValue({ code:'forbidden' });
    click('[data-delete-task]'); await flush();
    expect(document.querySelector('[data-task-id]')).not.toBeNull();
    tasks.listTasks.mockResolvedValue([]); await app.selectBoard(board);
    expect(document.querySelector('[data-task-list]').textContent).toContain('아직 등록된');
  });
});
