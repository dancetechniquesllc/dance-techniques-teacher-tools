import { fields } from "./communication-personalization.mjs";
import { sampleCategories, allowed, load as reloadLibrary, addPreviewResource } from "./resource-library.mjs";

const launch = document.querySelector("#resource-bulk-import");
const dialog = document.createElement("dialog");
dialog.className = "resource-import-dialog";
dialog.setAttribute("aria-labelledby", "resource-import-title");
dialog.innerHTML = `
  <header><h2 id="resource-import-title">Let’s Get Organized! 🎀</h2><button type="button" data-close aria-label="Close Bulk Import">×</button></header>
  <p>Upload your graphics and let us help you organize your Dance Techniques Resource Library.</p>
  <p role="status" data-status></p>
  <div data-batches></div>
  <section data-workspace hidden>
    <label class="import-drop">Drop Files Here or Browse Files<input type="file" multiple></label>
    <progress data-progress hidden></progress>
    <div data-summary></div>
    <nav data-overview aria-label="Uploaded Files"></nav>
    <div data-review></div>
    <div data-review-actions></div>
  </section>`;
document.body.append(dialog);
const get = selector => dialog.querySelector(selector);
const status = message => { get("[data-status]").textContent = message; };
const tour = () => document.body.dataset.tourMode === "true";
const client = () => window.dtSupabase;
const storage = () => client().storage.from("resource-import-drafts");
const draftDb = new Promise((resolve, reject) => {
  const request = indexedDB.open("dt-bulk-import", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("drafts", {keyPath:"id"});
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function previewDrafts(mode, operation) {
  const db = await draftDb;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts",mode);
    const request = operation(transaction.objectStore("drafts"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

let batch, categories = [], libraryTags = [], busy = false, previewUrl = "";
const checked = async promise => {
  const { data, error } = await promise;
  if (error) throw Error(error.message);
  return data;
};
const el = (tag, text = "") => Object.assign(document.createElement(tag), { textContent:text });
const action = (text, handler) => {
  const button = el("button", text);
  button.type = "button";
  button.onclick = () => run(handler);
  return button;
};
async function run(handler) {
  if (busy) return;
  busy = true;
  dialog.setAttribute("aria-busy", "true");
  status("");
  try { await handler(); }
  catch (error) {
    if (!tour() && error.message?.includes("public.resource_import_batches")) {
      status("Server drafts are not enabled yet. Continue your saved draft in the Bulk Import preview.");
      const link = el("a","Open Bulk Import Preview");
      link.href = location.pathname + "?tour=1";
      get("[data-status]").append(document.createTextNode(" "),link);
    } else status(error.message || "The import could not continue. Try again.");
  }
  finally { busy = false; dialog.removeAttribute("aria-busy"); }
}
async function persist(state) {
  if (!tour()) {
    await checked(client().from("resource_import_batches").update({state,revision:batch.revision+1})
      .eq("id",batch.id).eq("revision",batch.revision).select("id").single());
  }
  if (tour()) await previewDrafts("readwrite", store => store.put({...batch,state,revision:batch.revision+1}));
  batch.state = state;
  batch.revision++;
}
async function openBatch(record) {
  batch = record;
  get("[data-workspace]").hidden = false;
  if (tour()) for (const group of groupsFor(batch.state)) {
    if (!batch.state.saved?.[group.id]) continue;
    const entries = group.files.map(id=>batch.state.files.find(file=>file.id===id));
    const files = entries.filter(file=>!file.marked).sort((a,b)=>Number(b.id===group.official)-Number(a.id===group.official));
    const record = {id:group.id,organization_id:batch.organization_id,title:group.title,category_id:Number(group.category),
      tags:group.tags.split(",").map(tag=>tag.trim()).filter(Boolean),description:group.description,collection:"",
      captions:group.caption ? [{name:"Suggested Caption",text:group.caption}] : [],teacher_visible:group.visible,
      files:files.map(file=>({path:`${batch.organization_id}/${group.id}/${file.id}`,name:file.name,type:file.type,size:file.size,
        label:file.id===group.official ? "Official Version" : "Alternate Version"}))};
    addPreviewResource(record,files.map((file,index)=>[record.files[index].path,file.blob]));
  }
  await render();
}
async function openStudio() {
  const active = window.dtCurrentProfile;
  if (!tour() && (!active || !["admin","director"].includes(active.role))) throw Error("Director access is required.");
  const [records, choices, memberships] = tour() ? [await previewDrafts("readonly", store => store.getAll()),sampleCategories,[{organization_id:"sample"}]] : await Promise.all([
    checked(client().from("resource_import_batches").select("*").order("created_at",{ascending:false})),
    checked(client().from("resource_library_categories").select("id,name").order("name")),
    checked(client().from("resource_library_members").select("organization_id").eq("can_manage",true))
  ]);
  categories = choices;
  if (!tour()) {
    const {data} = await client().from("library_resources").select("tags").eq("archived",false);
    libraryTags = (data || []).flatMap(item=>item.tags || []);
  }
  const list = get("[data-batches]");
  list.replaceChildren();
  if (memberships.length === 1) list.append(action("Start New Import",async () => {
    const organization_id = memberships[0].organization_id;
    const record = tour() ? {id:crypto.randomUUID(),organization_id,state:{},revision:0,created_at:new Date().toISOString()}
      : await checked(client().from("resource_import_batches").insert({organization_id}).select().single());
    if (tour()) await previewDrafts("readwrite", store => store.put(record));
    await openBatch(record);
  }));
  else status("An import needs exactly one managed Resource Library organization.");
  for (const record of records) list.append(action(`Continue Import · ${new Date(record.created_at).toLocaleString()} · ${record.state.files?.length || 0} Files`,() => openBatch(record)));
}
async function addFiles(files) {
  if (!batch) throw Error("Start or continue an import first.");
  const progress = get("[data-progress]");
  progress.max = files.length || 1;
  progress.value = 0;
  progress.hidden = false;
  const failures = [];
  try {
    for (const file of files) {
      try {
        const type = allowed[file.name.split(".").pop().toLowerCase()];
        if (!type || !file.size || file.size > 50 * 1024 * 1024) throw Error("Choose a supported, nonempty file up to 50 MB.");
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer())), byte => byte.toString(16).padStart(2,"0")).join("");
        const id = crypto.randomUUID();
        const path = `${batch.organization_id}/${batch.id}/${id}`;
        if (!tour()) await checked(storage().upload(path,file,{contentType:type}));
        const entry = {id,path,name:file.name,type,size:file.size,hash,...(tour() ? {blob:file} : {})};
        if (/^image\/(png|jpeg|webp)$/.test(type)) {
          const bitmap = await createImageBitmap(file).catch(() => null);
          if (bitmap) {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 64;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap,0,0,64,64);
            entry.thumbnail = canvas.toDataURL("image/webp",.65);
            ctx.drawImage(bitmap,0,0,9,8);
            const pixels = ctx.getImageData(0,0,9,8).data;
            const tone = n => pixels[n*4]*.299 + pixels[n*4+1]*.587 + pixels[n*4+2]*.114;
            entry.visual = Array.from({length:64},(_,n) => {
              const left = n + Math.floor(n/8);
              return tone(left) > tone(left+1) ? "1" : "0";
            }).join("");
            bitmap.close();
          }
        }
        const entries = [...(batch.state.files || []),entry];
        try { await persist({...batch.state,files:entries,position:batch.state.groups ? batch.state.groups.length : entries.length-1,
          ...(batch.state.groups ? {groups:[...batch.state.groups,{id,files:[id],official:id}]} : {})}); }
        catch (error) {
          if (!tour()) await storage().remove([path]).catch(() => {});
          throw error;
        }
      } catch (error) { failures.push(`${file.name} — ${error.message}`); }
      progress.value++;
      get("[data-summary]").textContent = `${batch.state.files?.length || 0} Files Saved to Draft`;
    }
  } finally { progress.hidden = true; }
  await render();
  status(failures.length ? failures.join("\n") : tour() ? "Draft saved in this browser." : "Files saved to your secure draft.");
}
const readFile = file => tour() ? Promise.resolve(file.blob) : checked(storage().download(file.path));
const groupsFor = state => state.groups || (state.files || []).map(file => ({id:file.id, files:[file.id], official:file.id}));
async function confirmExclusions(marked) {
  if (!marked.length) return new Set();
  const confirmation = el("dialog");
  confirmation.className = "resource-import-dialog";
  confirmation.setAttribute("aria-label","Confirm Resource Deletion");
  confirmation.append(el("h2","Confirm Resource Deletion"),el("p","Selected uploads will be excluded. Their original and draft copies will be preserved."));
  const checks = marked.map(file => {
    const label = el("label");
    const check = el("input");
    check.type = "checkbox";
    check.value = file.id;
    if (file.thumbnail) label.append(Object.assign(el("img"),{src:file.thumbnail,alt:"",width:40,height:40}));
    label.append(check,document.createTextNode(` ${file.name} · New Upload`));
    const row = el("div");
    row.append(label);
    confirmation.append(row);
    return check;
  });
  const selection = el("p");
  const apply = el("button","Confirm Delete (0)");
  apply.disabled = true;
  function update() {
    const count = checks.filter(check=>check.checked).length;
    selection.textContent = `${count} of ${checks.length} Selected for Deletion`;
    apply.textContent = `Confirm Delete (${count})`;
    apply.disabled = count === 0;
  }
  confirmation.onchange = update;
  update();
  apply.onclick = () => confirmation.close("confirm");
  const cancel = el("button","Cancel");
  cancel.onclick = () => confirmation.close();
  confirmation.append(selection,cancel,apply);
  document.body.append(confirmation);
  confirmation.showModal();
  await new Promise(resolve=>confirmation.addEventListener("close",resolve,{once:true}));
  confirmation.remove();
  return confirmation.returnValue === "confirm" ? new Set(checks.filter(check=>check.checked).map(check=>check.value)) : null;
}
async function downloadOfficial() {
  const { Zip, ZipPassThrough } = await import("./vendor/fflate-0.8.2.mjs");
  const chunks = [];
  const archive = new Zip((error,chunk) => { if (error) throw error; chunks.push(chunk); });
  const used = new Set();
  const csv = value => `"${String(value).replace(/^([=+@-])/,"'$1").replaceAll('"','""')}"`;
  const rows = [["Original Filename","Approved Filename","Resource Title","Category","Resource Identifier","Import Date"]];
  const clean = value => value.normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g,"-").trim().replace(/^\.+|[. ]+$/g,"").slice(0,90);
  for (const [id, snapshot] of Object.entries(batch.state.saved || {})) {
    const file = batch.state.files.find(item=>item.id===snapshot.file);
    const category = snapshot.categoryName || categories.find(item=>String(item.id)===snapshot.category)?.name || "Resources";
    const stem = "DT-" + (clean(snapshot.title).replace(/\s+/g,"-") || "Resource");
    const extension = file.name.split(".").at(-1);
    const folder = clean(category) || "Resources";
    let filename = `${stem}.${extension}`;
    for (let n=2;used.has(`${folder}/${filename}`.toLowerCase());n++) filename = `${stem}-${n}.${extension}`;
    const path = `${folder}/${filename}`;
    used.add(path.toLowerCase());
    const member = new ZipPassThrough(path);
    archive.add(member);
    const reader = (await readFile(file)).stream().getReader();
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      member.push(value);
    }
    member.push(new Uint8Array(),true);
    rows.push([file.name,filename,snapshot.title,category,id,snapshot.date]);
  }
  const manifest = new ZipPassThrough("Import Manifest.csv");
  archive.add(manifest);
  manifest.push(new TextEncoder().encode(rows.map(row=>row.map(csv).join(",")).join("\r\n")),true);
  archive.end();
  const url = URL.createObjectURL(new Blob(chunks,{type:"application/zip"}));
  const link = el("a");
  link.href = url;
  link.download = "Dance Techniques - Official Graphics.zip";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  status("Before removing your original files, verify your ZIP and ensure important editable source files are backed up.");
}
async function importApproved() {
  const state = batch.state;
  const entries = state.files || [];
  const groups = groupsFor(state).filter(group => group.approved && !state.saved?.[group.id]);
  const marked = entries.filter(file => file.marked && !file.excluded);
  const chosen = await confirmExclusions(marked);
  if (!chosen) return;
  if (chosen.size) await persist({...batch.state,files:entries.map(file=>chosen.has(file.id) ? {...file,excluded:true} : file)});
  let imported = 0;
  const errors = [];
  for (const group of groups) {
    try {
      const files = group.files.map(id=>entries.find(file=>file.id===id));
      if (files.some(file => file.marked && !file.excluded && !chosen.has(file.id))) throw Error("Confirm or undo the marked versions first.");
      const kept = files.filter(file=>!file.marked).sort((a,b)=>Number(b.id===group.official)-Number(a.id===group.official));
      if (kept[0]?.id !== group.official || kept.length > 20) throw Error("Choose an official version and keep no more than 20 versions.");
      const record = {id:group.id,organization_id:batch.organization_id,title:group.title,category_id:Number(group.category),
        tags:[...new Set(group.tags.split(",").map(tag=>tag.trim()).filter(tag=>tag && tag.toLowerCase()!=="teacher tools"))],
        description:group.description,collection:"",teacher_visible:group.visible,
        captions:group.caption ? [{name:"Suggested Caption",text:group.caption}] : [],archived:false,
        files:kept.map(file=>({path:`${batch.organization_id}/${group.id}/${file.id}`,name:file.name,type:file.type,size:file.size,
          label:file.id===group.official ? "Official Version" : "Alternate Version"}))};
      if (tour()) {
        addPreviewResource(record,await Promise.all(kept.map(async(file,index)=>[record.files[index].path,await readFile(file)])));
      } else {
        const library = client().storage.from("resource-library");
        const existing = await checked(client().from("library_resources").select("id,files").eq("id",group.id).maybeSingle());
        if (!existing) {
          for (const [index,file] of kept.entries()) {
            const target = record.files[index].path;
            const result = await library.upload(target,await readFile(file),{contentType:file.type,upsert:false});
            if (result.error && Number(result.error.statusCode)!==409) throw result.error;
          }
          await checked(client().from("library_resources").insert(record));
        } else if (existing.files[0]?.path !== record.files[0].path) throw Error("This resource already exists with a different official version.");
      }
      await persist({...batch.state,saved:{...batch.state.saved,[group.id]:{title:group.title,category:group.category,categoryName:categories.find(item=>String(item.id)===group.category)?.name,file:group.official,date:new Date().toISOString()}}});
      imported++;
    } catch(error) { errors.push(`${group.title} · ${error.message}`); }
  }
  if (!tour()) await reloadLibrary();
  await render();
  status(`${imported} Resources Saved${errors.length ? "\n"+errors.join("\n") : ""}`);
}
const metadataFields = {title:"Resource Title",category:"Category",tags:"Tags",description:"Description",caption:"Suggested Caption"};
const splitTags = value => {
  const seen = new Set();
  return String(value || "").split(",").map(tag=>tag.trim()).filter(tag => {
    const key = tag.toLowerCase();
    if (!key || key === "teacher tools" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
function reviewTulleSuggestions(data, fieldsToReview = metadataFields) {
  const modal = el("dialog");
  modal.className = "resource-import-dialog tulle-review";
  modal.setAttribute("aria-label","A Little TULLE Touch?");
  const mascot = Object.assign(el("img"),{src:"assets/tulle-solo.png",alt:""});
  modal.append(mascot,el("h2","A Little TULLE Touch?"),el("p","TULLE has prepared suggestions for this resource. Would you like to apply them?"));
  const selected = [];
  for (const [key,name] of Object.entries(fieldsToReview)) {
    const row = el("label");
    const check = Object.assign(el("input"),{type:"checkbox",checked:true,value:key});
    selected.push(check);
    const value = key === "category" ? data.categories?.find(item=>String(item.id)===String(data.category))?.name :
      key === "tags" ? data.tags.join(", ") : data[key];
    row.append(check,el("strong",name),el("span",value));
    modal.append(row);
  }
  const footer = el("footer");
  const keep = el("button","Keep My Version");
  const apply = el("button","Apply TULLE’s Touch");
  apply.className = "primary";
  keep.onclick = () => modal.close();
  apply.onclick = () => modal.close("apply");
  footer.append(keep,apply);
  modal.append(footer);
  document.body.append(modal);
  modal.showModal();
  return new Promise(resolve=>modal.addEventListener("close",()=>{
    modal.remove();
    resolve(modal.returnValue === "apply" ? selected.filter(input=>input.checked).map(input=>input.value) : []);
  },{once:true}));
}

async function render() {
  const entries = batch.state.files || [];
  const groups = groupsFor(batch.state);
  const position = Math.min(batch.state.position || 0, groups.length-1);
  const group = groups[position];
  const approved = groups.filter(group => group.approved).length;
  const overview = get("[data-overview]");
  const thumbnailScroll = overview.scrollLeft;
  const review = get("[data-review]");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  get("[data-summary]").textContent = `${entries.length} Files Uploaded · ${approved} Resources Approved · ${groups.length-approved} Awaiting Review`;
  overview.replaceChildren();
  review.replaceChildren();
  get("[data-review-actions]").replaceChildren();
  if (!group) return;
  const files = group.files.map(id => entries.find(file => file.id === id));
  const selected = files.find(file => file.id === group.official) || files[0];
  const edit = el("form");
  const controls = {};
  function field(label, tag, name, value) {
    const wrapper = el("label",label);
    const control = el(tag);
    control.name = name;
    control.setAttribute("aria-label", label);

    controls[name] = control;
    if (tag !== "select") control.value = value || "";
    wrapper.append(control);
    edit.append(wrapper);
    return control;
  }
  field("Resource Title","input","title",group.title).required = true;
  const category = field("Category","select","category");
  category.required = true;
  category.append(new Option("Choose a Category",""), ...categories.map(item => new Option(item.name,item.id)));
  category.value = group.category || "";
  const tagInput = field("Tags","input","tags");
  tagInput.placeholder = "Type a Tag and Press Enter";
  const tagList = el("div");
  tagList.className = "import-tag-list";
  tagInput.before(tagList);
  let tags = splitTags(group.tags);
  const saved = Boolean(batch.state.saved?.[group.id]);
  function renderTags() {
    tagList.replaceChildren(...tags.map(tag => {
      const chip = el("span",tag);
      if (!saved) {
        const remove = el("button","×");
        remove.type = "button";
        remove.setAttribute("aria-label",`Remove Tag: ${tag}`);
        remove.onclick = () => { tags = tags.filter(value=>value!==tag); renderTags(); };
        chip.append(remove);
      }
      return chip;
    }));
  }
  const existingTags = el("datalist");
  existingTags.id = "import-existing-tags";
  existingTags.append(...splitTags([...groups.map(item=>item.tags),...libraryTags].join(",")).map(tag=>new Option(tag,tag)));
  tagInput.setAttribute("list",existingTags.id);
  tagInput.after(existingTags);
  tagInput.onkeydown = event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    tags = splitTags([...tags,tagInput.value].join(","));
    tagInput.value = "";
    renderTags();
  };
  renderTags();
  field("Description","textarea","description",group.description);
  const caption = field("Suggested Caption","textarea","caption",group.caption);
  const captionLabel = caption.parentElement;
  const captionSection = el("div");
  captionSection.className = "import-caption";
  captionLabel.before(captionSection);
  const captionTitle = el("label","Suggested Caption");
  caption.id = "import-caption-editor";
  captionTitle.htmlFor = caption.id;
  captionSection.append(captionTitle);
  const toolbar = el("div");
  toolbar.className = "import-caption-tools";
  captionSection.append(toolbar,caption);
  captionLabel.remove();
  const history = [];
  let priorCaption = caption.value;
  let selection = [caption.selectionStart,caption.selectionEnd];
  function captureSelection() { selection = [caption.selectionStart,caption.selectionEnd]; }
  for (const event of ["select","blur","keyup","pointerup"]) caption.addEventListener(event,captureSelection);
  const undo = el("button","↶ Undo");
  undo.type = "button";
  undo.disabled = true;
  caption.addEventListener("input",event=>{
    if (caption.value === priorCaption) return;
    if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") {
      history.push(priorCaption);
      if (history.length>100) history.shift();
    } else if (history.at(-1) === caption.value) history.pop();
    priorCaption = caption.value;
    undo.disabled = !history.length;
  });
  undo.onclick = () => {
    if (!history.length) return;
    caption.value = priorCaption = history.pop();
    undo.disabled = !history.length;
    caption.focus();
    captureSelection();
  };
  function insertCaption(value,start,end) {
    caption.setRangeText(value,start,end,"end");
    caption.dispatchEvent(new Event("input",{bubbles:true}));
    caption.focus();
    captureSelection();
  }
  const personalize = el("button","{ } Personalize");
  personalize.type = "button";
  personalize.setAttribute("aria-expanded","false");
  const fieldMenu = el("div");
  fieldMenu.className = "import-caption-menu";
  fieldMenu.hidden = true;
  function closeFields() {
    fieldMenu.hidden = true;
    personalize.setAttribute("aria-expanded","false");
  }
  personalize.onclick = () => {
    if (!fieldMenu.hidden) { closeFields(); return; }
    fieldMenu.hidden = false;
    personalize.setAttribute("aria-expanded","true");
    fieldMenu.querySelector("button")?.focus();
  };
  fieldMenu.onkeydown = event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeFields(); personalize.focus(); }
  };
  fieldMenu.onfocusout = event => {
    if (!fieldMenu.contains(event.relatedTarget) && event.relatedTarget !== personalize) closeFields();
  };
  for (const [name,label] of fields) {
    const option = el("button",label);
    option.type = "button";
    option.onclick = () => { closeFields(); insertCaption(`{${name}}`,...selection); };
    fieldMenu.append(option);
  }
  const captionTouch = action("✨ TULLE’s Touch",async () => {
    const data = await requestTulle(caption.value);
    const accepted = await reviewTulleSuggestions(data,{caption:"Suggested Caption"});
    if (accepted.length) {
      insertCaption(data.caption,0,caption.value.length);
      status("TULLE’s caption is ready to edit. Save Draft keeps it for later.");
    }
  });
  if (saved) { captionTouch.disabled = true; personalize.disabled = true; }
  toolbar.append(captionTouch,personalize,undo,fieldMenu);
  const visible = field("Visible in Teacher Tools","input","visible");
  visible.type = "checkbox";
  visible.setAttribute("role","switch");
  visible.checked = Boolean(group.visible);
  const visibilityRow = visible.parentElement;
  visibilityRow.className = "import-visibility";
  const ttBadge = el("span","TT");
  ttBadge.className = "import-tt-badge";
  ttBadge.setAttribute("aria-label","Visible in Teacher Tools");
  const switchLabel = el("span");
  switchLabel.className = "import-visibility-switch";
  switchLabel.setAttribute("aria-hidden","true");
  function updateVisibility() {
    ttBadge.hidden = !visible.checked;
    switchLabel.textContent = visible.checked ? "ON" : "OFF";
  }
  visible.onchange = updateVisibility;
  updateVisibility();
  visibilityRow.append(ttBadge,switchLabel);
  const official = field("Official Version","select","official");
  official.append(...files.filter(file => !file.marked).map(file => new Option(file.name,file.id)));
  official.value = files.length === 1 && !files[0].marked ? files[0].id : group.official || "";
  official.parentElement.hidden = files.length === 1;
  if (batch.state.saved?.[group.id]) for (const control of Object.values(controls)) control.disabled = true;
  const metadata = () => Object.fromEntries(["title","category","tags","description","caption","visible","official"].map(name =>
    [name,name === "tags" ? splitTags([...tags,tagInput.value].join(",")).join(", ") : name === "visible" ? controls[name].checked : controls[name].value.trim()]));
  const save = async (next, approve = false, changes = {}) => {
    const draft = metadata();
    const changed = Object.entries(draft).some(([key,value]) => value !== (group[key] ?? (key === "visible" ? false : "")));
    if (batch.state.saved?.[group.id]) { await persist({...batch.state,position:next}); await render(); return; }
    if (approve && (!edit.reportValidity() || !draft.title || !draft.official)) throw Error("Enter a title, choose a category, and select an official version.");
    const updated = groups.map(item => item === group ? {...item,...draft,approved:approve || (item.approved && !changed)} : item);
    await persist({...batch.state,groups:updated,position:next,...changes});
    await render();
  };
  for (const [index,item] of groups.entries()) {
    const file = entries.find(entry => entry.id === (item.official || item.files[0]));
    const button = action(file.thumbnail ? "" : String(index+1), () => save(index));
    if (file.thumbnail) button.append(Object.assign(el("img"),{src:file.thumbnail,alt:""}));
    button.title = item.title || file.name;
    button.setAttribute("aria-label",button.title);
    button.setAttribute("aria-pressed",String(index === position));
    button.classList.toggle("import-marked",Boolean(file.marked));
    const tile = el("div");
    tile.className = "import-thumbnail";
    if (index === position) button.setAttribute("aria-current","true");
    const tileStatus = file.marked ? "Marked for Deletion" : item.approved ? "Approved" : item.needsReview ? "Needs Attention" : "Awaiting Review";
    const badge = el("small",tileStatus);
    badge.dataset.state = file.marked ? "marked" : item.approved ? "approved" : item.needsReview ? "attention" : "review";
    tile.append(button,badge);
    if (!batch.state.saved?.[item.id]) {
      const mark = action(file.marked ? "↶" : "×", async () => {
        const updated = entries.map(entry => entry === file ? {...entry,marked:!entry.marked} : entry);
        if (item === group) {
          if (!file.marked) official.value = "";
          await save(position,false,{files:updated});
        } else {
          const revised = groups.map(entry=>entry === item ? {...entry,official:file.marked ? entry.official : "",approved:false} :
            entry === group ? {...entry,...metadata(),approved:false} : entry);
          await persist({...batch.state,groups:revised,files:updated});
          await render();
        }
      });
      mark.className = "import-thumbnail-mark";
      mark.setAttribute("aria-label",`${file.marked ? "Undo Deletion Mark for" : "Mark for Deletion:"} ${file.name}`);
      tile.append(mark);
    }
    overview.append(tile);
  }
  overview.scrollLeft = thumbnailScroll;
  const media = el("section");
  const officialBadge = el("small");
  function updateOfficialBadge() {
    officialBadge.textContent = selected.marked ? "Marked for Deletion" :
      official.value === selected.id ? "Official Version" :
      official.value ? "Official Version Selected Below" : "Choose an Official Version";
  }
  official.addEventListener("change",updateOfficialBadge);
  updateOfficialBadge();
  media.append(el("h3",`Resource ${position+1} of ${groups.length}`),el("p",group.title || selected.name),officialBadge);
  if (group.title) media.append(el("small",selected.name));
  const preview = el("div");
  preview.className = selected.marked ? "import-marked" : "";
  media.append(preview);
  for (const file of files.filter(() => !batch.state.saved?.[group.id])) {
    media.append(action(file.marked ? `Undo · ${file.name}` : `× · ${file.name}`, async () => {
      if (official.value === file.id && !file.marked) official.selectedIndex = -1;
      await save(position,false,{files:entries.map(item=>item === file ? {...item,marked:!item.marked} : item)});
    }));
  }
  const similar = groups.filter(item => !batch.state.saved?.[group.id] && !batch.state.saved?.[item.id] && item !== group && item.files.some(id => {
    const file = entries.find(entry=>entry.id === id);
    return file.hash === selected.hash || (file.visual && selected.visual &&
      [...file.visual].filter((bit,index)=>bit !== selected.visual[index]).length <= 7);
  }));
  if (similar.length) {
    media.append(el("h4","TULLE’s Tidy-Up"),el("p","Similar Resources Found"));
    for (const item of similar) {
      const file = entries.find(entry=>entry.id === item.files[0]);
      const compare = action(file.name,()=>save(groups.indexOf(item)));
      if (file.thumbnail) compare.prepend(Object.assign(el("img"),{src:file.thumbnail,alt:""}));
      media.append(compare,action("Group as Versions",async () => {
        const merged = groups.flatMap(entry=>entry === item ? [] : entry === group ?
          [{...group,...metadata(),files:[...group.files,...item.files],approved:false}] : [entry]);
        await persist({...batch.state,groups:merged,position:merged.findIndex(entry=>entry.id === group.id)});
        await render();
      }));
    }
  }
  if (files.length > 1 && !batch.state.saved?.[group.id]) media.append(action("Divide Into Separate Resources",async () => {
    const divided = groups.flatMap(item=>item === group ? files.map(file=>({
      ...(file.id === group.official ? metadata() : {}),id:file.id,files:[file.id],official:file.marked ? "" : file.id
    })) : [item]);
    await persist({...batch.state,groups:divided,position});
    await render();
  }));
  const footer = el("footer");
  const previous = action("← Previous",()=>save(position-1));
  previous.disabled = position === 0;
  previous.className = "import-previous";
  const saveDraft = action("Save Draft",()=>save(position));
  saveDraft.className = "import-save-draft";
  footer.append(previous,saveDraft);
  if (!saved) {
    const last = position === groups.length-1;
    const approve = action(last ? "✓ Approve Resource" : "🎀 Approve & Next →",()=>save(Math.min(position+1,groups.length-1),true));
    approve.className = "import-approve";
    footer.append(approve);
  }
  edit.onsubmit = event => event.preventDefault();
  footer.className = "import-review-actions";
  const actions = get("[data-review-actions]");
  actions.replaceChildren(footer);
  const outstanding = groups.findIndex(item=>!item.approved);
  if (approved && outstanding >= 0 && outstanding !== position) {
    footer.append(action(`Review Remaining (${groups.length-approved})`,()=>save(outstanding)));
  }
  if (groups.some(item=>item.approved && !batch.state.saved?.[item.id])) edit.append(action("✨ Save All Approved Resources",async () => {
    await save(position);
    await importApproved();
  }));
  if (Object.keys(batch.state.saved || {}).length) edit.append(action("Download Official Graphics ZIP",downloadOfficial));
  const aiClient = tour() ? window.dtResourceAnalysisClient : client();
  const aiPanel = el("div");
  aiPanel.className = "import-ai-panel";
  if (tour() && !(await aiClient?.auth.getSession())?.data.session) {
    aiPanel.append(el("p","TULLE uses your Director Dashboard sign-in at this preview address. Your draft stays here."));
    const signIn = el("a","Open Director Sign-In");
    signIn.href = location.pathname;
    signIn.target = "_blank";
    signIn.rel = "noopener";
    aiPanel.append(signIn);
  }
  aiPanel.prepend(el("strong","TULLE’s Review"));
  edit.prepend(aiPanel);
  async function requestTulle(captionDraft) {
    if (!aiClient) throw Error("The sign-in service could not load. Manual review is available.");
    const {data:{session}} = await aiClient.auth.getSession();
    if (!session) throw Error("Sign in as a director in the other tab, then try again here.");
    status("TULLE is reviewing your resources…");
    let body;
    if (tour()) {
      body = new FormData();
      if (captionDraft !== undefined) body.append("captionDraft",captionDraft);
      body.append("artwork",new Blob([await readFile(selected)],{type:selected.type}),"artwork");
    } else body = {batchId:batch.id,fileId:selected.id,captionDraft};
    const { data, error } = await aiClient.functions.invoke("resource-import-analysis",{body,headers:{Authorization:`Bearer ${session.access_token}`}});
    if (error) {
      const failure = await error.context?.json?.().catch(()=>null);
      throw Error(failure?.message || "TULLE’s Review is unavailable. You can still review manually.");
    }
    return data;
  }
  if (!saved) aiPanel.append(action("Give It a TULLE Touch!",async () => {
    const data = await requestTulle();
    if (Array.isArray(data.categories)) {
      categories = data.categories;
      controls.category.replaceChildren(new Option("Choose a Category",""), ...categories.map(item=>new Option(item.name,item.id)));
    }
    const selectedFields = await reviewTulleSuggestions(data);
    if (!selectedFields.length) { status("Your version was kept."); return; }
    for (const key of selectedFields) {
      if (key === "tags") { tags = splitTags(data.tags.join(",")); tagInput.value = ""; }
      else controls[key].value = data[key];
    }
    const revised = groups.map(item=>item === group ? {...item,...metadata(),approved:false,needsReview:data.needsReview} : item);
    await persist({...batch.state,groups:revised,position});
    await render();
    status(data.needsReview ? "TULLE’s Take is ready. Check the caption before approving." : "TULLE’s Take applied. Review the suggestions before approving.");
  }));
  review.append(media,edit);
  if (/^image\/(png|jpeg|webp)$|^video\/mp4$|^application\/pdf$/.test(selected.type)) {
    const file = await readFile(selected);
    previewUrl = URL.createObjectURL(new Blob([file],{type:selected.type}));
    const image = el(selected.type.startsWith("image/") ? "img" : selected.type === "video/mp4" ? "video" : "iframe");
    image.alt = selected.name;
    image.title = selected.name;
    if (image.tagName === "IFRAME") image.setAttribute("sandbox","");
    if (image.tagName === "VIDEO") image.controls = true;
    image.src = previewUrl;
    preview.append(image);
  }
}
launch.onclick = () => {
  batch = null;
  get("[data-workspace]").hidden = true;
  dialog.showModal();
  void run(openStudio);
};
get("[data-close]").onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener("cancel",event => { if (busy) event.preventDefault(); });
dialog.addEventListener("close",() => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  get("[data-review]").replaceChildren();
});
const input = get('input[type="file"]');
input.onchange = () => {
  const files = [...input.files];
  input.value = "";
  if (files.length) void run(() => addFiles(files));
};
const drop = get(".import-drop");
drop.ondragover = event => event.preventDefault();
drop.ondrop = event => {
  event.preventDefault();
  const files = [...event.dataTransfer.files];
  if (files.length) void run(() => addFiles(files));
};
