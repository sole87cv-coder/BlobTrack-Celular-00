import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigation } from '../src/ui/navigation.js';

class FakeElement {
  constructor() { this.hidden=false; this.attributes=new Map(); this.listeners=new Map(); this.heading={focus:()=>{this.focused=true;}}; }
  setAttribute(name,value) { this.attributes.set(name,value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name,listener) { this.listeners.set(name,listener); }
  querySelector() { return this.heading; }
  click() { this.listeners.get('click')?.(); }
}

test('navigation switches pages and marks the active destination', () => {
  const names=['stage','session','settings','help'];
  const pages=names.map(name=>({name,element:new FakeElement()}));
  const buttons=names.map(name=>({name,element:new FakeElement()}));
  const changes=[];
  const nav=createNavigation({pages,buttons,onChange:(next,previous)=>changes.push([next,previous])});
  assert.equal(nav.current,'stage');
  assert.equal(pages[0].element.hidden,false);
  assert.equal(buttons[0].element.attributes.get('aria-current'),'page');
  buttons[2].element.click();
  assert.equal(nav.current,'settings');
  assert.equal(pages[0].element.hidden,true);
  assert.equal(pages[2].element.hidden,false);
  assert.equal(buttons[2].element.attributes.get('aria-current'),'page');
  assert.deepEqual(changes,[['stage',null],['settings','stage']]);
});

test('navigation rejects unknown destinations and can focus a destination heading', () => {
  const page=new FakeElement();
  const nav=createNavigation({pages:[{name:'stage',element:page}],buttons:[],initial:'stage'});
  assert.equal(nav.navigate('unknown'),false);
  assert.equal(nav.current,'stage');
  nav.navigate('stage',{focus:true});
  assert.equal(page.focused,true);
});