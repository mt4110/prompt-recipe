import test from "node:test";
import assert from "node:assert/strict";
import {defaultShortcut,normalizeShortcut,shortcutFromEvent,shortcutLabel,shortcutWarning,matchesShortcut} from "../src/shortcut.ts";
test("platform defaults and labels use the configured binding",()=>{
 assert.equal(defaultShortcut(true),"Alt+Space");assert.equal(defaultShortcut(false),"Control+Shift+Space");
 assert.equal(shortcutLabel("Alt+Space",true),"⌥Space");assert.equal(shortcutLabel("Control+Alt+KeyP",true),"⌃⌥P");assert.equal(shortcutLabel("Super+Shift+KeyK",true),"⇧⌘K");assert.equal(shortcutLabel("Control+Shift+Space",false),"Ctrl+Shift+Space");
});
test("recording uses physical key codes even when Option changes the character",()=>{
 const e={code:"KeyP",ctrlKey:true,altKey:true,shiftKey:false,metaKey:false};assert.equal(shortcutFromEvent(e),"Control+Alt+KeyP");
 for(const value of ["Space","Shift+KeyP","Alt+Alt+Space","Alt+Unknown","Alt+F99","Alt+F01"]){assert.throws(()=>normalizeShortcut(value),value);}
});
test("input source warnings apply only to the conflicting macOS combinations",()=>{
 for(const value of ["Control+Space","Alt+Control+Space"])assert.match(shortcutWarning(value,true)!,/入力ソース/);
 assert.equal(shortcutWarning("Alt+Space",true),null);assert.equal(shortcutWarning("Control+Space",false),null);
});
test("preview shortcuts honor all modifiers and reject IME and repeat events",()=>{
 const e={code:"Space",ctrlKey:false,altKey:true,shiftKey:false,metaKey:false,isComposing:false,repeat:false} as KeyboardEvent;
 assert.equal(matchesShortcut(e,"Alt+Space"),true);assert.equal(matchesShortcut({...e,shiftKey:true} as KeyboardEvent,"Alt+Space"),false);
 assert.equal(matchesShortcut({...e,isComposing:true} as KeyboardEvent,"Alt+Space"),false);assert.equal(matchesShortcut({...e,repeat:true} as KeyboardEvent,"Alt+Space"),false);
});

test("function key labels retain F for every supported key",()=>{
 for(let n=1;n<=24;n++){assert.equal(shortcutLabel(`Alt+F${n}`,true),`⌥F${n}`);assert.equal(shortcutLabel(`Control+F${n}`,false),`Ctrl+F${n}`);}
});
