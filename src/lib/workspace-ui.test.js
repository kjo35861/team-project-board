// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountWorkspaceUI } from './workspace-ui.js';
const boards = [{id:'a',name:'Alpha',owner_id:'u'}, {id:'b',name:'<img src=x onerror=alert(1)>',owner_id:'other'}];
let ui, select, create, refresh;
beforeEach(() => {
  history.replaceState(null,'','/');
  document.body.innerHTML=readFileSync('index.html','utf8').split('<body>')[1].split('</body>')[0];
  select=vi.fn(id=>{const board=boards.find(b=>b.id===id); if(!board)return false;ui.onBoardSelected(board,{reason:'user-selection'});return true;});
  create=vi.fn();refresh=vi.fn();
  ui=mountWorkspaceUI({userId:'u',onSelect:select,onCreate:create,onRefresh:refresh});
});
afterEach(()=>{ui.dispose();document.body.innerHTML='';history.replaceState(null,'','/');});
const click=s=>document.querySelector(s).click();
describe('workspace overview navigation',()=>{
  it('opens all boards from breadcrumb, escapes names and enters the selected board',()=>{
    ui.update({status:'success',boards});
    click('[data-workspace-link]');
    expect(location.hash).toBe('#workspace');
    expect(document.querySelector('#workspace-page').hidden).toBe(false);
    expect(document.querySelector('#board').hidden).toBe(true);
    expect(document.querySelectorAll('.workspace-board-card')).toHaveLength(2);
    expect(document.querySelector('.workspace-board-card img')).toBeNull();
    expect(document.querySelector('#workspace-count').textContent).toContain('2');
    click('[data-workspace-board="b"]');
    expect(select).toHaveBeenCalledWith('b');
    expect(location.hash).toBe('#board/b');
    expect(document.querySelector('#board').hidden).toBe(false);
  });
  it('restores overview through browser navigation and offers loading, error, empty and retry',()=>{
    history.replaceState(null,'','#workspace');window.dispatchEvent(new HashChangeEvent('hashchange'));
    ui.update({status:'loading',boards:[]});expect(document.querySelector('#workspace-board-list').textContent).toContain('불러오는 중');
    ui.update({status:'error',boards:[]});expect(document.querySelector('#workspace-board-list').textContent).toContain('불러오지 못');
    click('[data-workspace-refresh]');expect(refresh).toHaveBeenCalledOnce();
    ui.update({status:'empty',boards:[]});expect(document.querySelector('#workspace-board-list').textContent).toContain('첫 보드');
    click('[data-workspace-create]');expect(create).toHaveBeenCalledOnce();
  });
  it('keeps overview open while server selection changes in the background',()=>{
    click('[data-workspace-link]');
    ui.onBoardSelected(boards[0],{reason:'list-refresh'});
    expect(document.querySelector('#workspace-page').hidden).toBe(false);
    ui.onBoardSelected(boards[0],{reason:'user-selection'});
    expect(document.querySelector('#workspace-page').hidden).toBe(true);
  });
  it('honors direct board links after the first server snapshot',async()=>{
    history.replaceState(null,'','#board/b');
    ui.update({status:'success',boards});
    ui.onBoardSelected(boards[0],{reason:'list-refresh'});await Promise.resolve();
    expect(select).toHaveBeenCalledWith('b');
    expect(document.querySelector('#breadcrumb-board-name').textContent).toBe(boards[1].name);
  });
});
it('replaces a deleted board address with the actual fallback board',()=>{
 ui.onBoardSelected(boards[0],{reason:'user-selection'});
 ui.onBoardSelected(boards[1],{reason:'list-refresh'});
 expect(location.hash).toBe('#board/b');
 expect(document.querySelector('#breadcrumb-board-name').textContent).toBe(boards[1].name);
});
it('returns to overview when the last active board disappears',()=>{
 ui.onBoardSelected(boards[0],{reason:'user-selection'});
 ui.onBoardSelected(null,{reason:'list-refresh'});
 expect(location.hash).toBe('#workspace');
 expect(document.querySelector('#workspace-page').hidden).toBe(false);
});

it('replaces inaccessible or malformed board addresses with the workspace route',()=>{
 for(const hash of ['#board/unavailable','#board/%E0%A4%A']) {
  history.replaceState(null,'',hash);window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(location.hash).toBe('#workspace');
  expect(document.querySelector('#workspace-page').hidden).toBe(false);
 }
});
