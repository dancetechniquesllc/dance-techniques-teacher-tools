import { fields, captionFields, personalizeCaption } from "./communication-personalization.mjs";

const panel = document.querySelector('#admin-home-resource-library');
const bucket = 'resource-library';
export const allowed = { webp:'image/webp', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', pdf:'application/pdf', mp4:'video/mp4', mp3:'audio/mpeg', txt:'text/plain', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const $ = (selector) => panel.querySelector(selector);
const editor = $('#resource-editor');
const detail = $('#resource-detail');
const form = editor.querySelector('form');
const demo = new Map();
let categories = [];
let resources = [];
let subfolders = [];
let activeFolder = null;
let dragged;
let organizing = false;
const previewFolderKey = 'dt-resource-library-folders';
let previewPlacements = {};

let editing;
let draftId;
let versions;
let pending;
let objectUrl;
let busy = false;
let viewRequest = 0;
const client = () => window.dtSupabase;
const tour = () => document.body.dataset.tourMode === 'true';
const checked = async request => {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
};
function option(value, label) { return new Option(label, value); }
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, action) {
  const node = element('button', label, 'secondary');
  node.type = 'button';
  node.onclick = action;
  return node;
}
const category = id => categories.find(item => item.id === folderCategoryId(categories, id))?.name || '';
const report = (message, target = $('#resource-status')) => { target.textContent = message; };

function formatTag(tag) {
  const shortWords = /^(a|an|and|as|at|but|by|for|in|nor|of|on|or|per|the|to|via)$/i;
  const words = tag.trim().split(/\s+/);
  return words.map((word, index) => {
    if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
    if (index > 0 && index < words.length - 1 && shortWords.test(word)) return word.toLowerCase();
    return word.replace(/^\p{L}/u, letter => letter.toUpperCase());
  }).join(' ');
}

function visibilityToggle(resource) {
  const toggle = button('Teacher Tools', async () => {
    const visible = !resource.teacher_visible;
    toggle.disabled = true;
    report('');
    try {
      if (!tour()) {
        const saved = await checked(client().from('library_resources')
          .update({teacher_visible:visible}).eq('id',resource.id).eq('updated_at',resource.updated_at)
          .select('teacher_visible,updated_at').single());
        Object.assign(resource, saved);
      } else resource.teacher_visible = visible;
      toggle.setAttribute('aria-checked', String(resource.teacher_visible));
      if (['teacher', 'director'].includes($('#resource-visibility').value) ||
          $('#resource-search').value.trim()) render();
      report(visible ? 'Resource is visible in Teacher Tools.' : 'Resource is hidden in Teacher Tools.');
    } catch (error) {
      report('Could not change Teacher Tools visibility. ' + error.message);
    } finally {
      toggle.disabled = false;
    }
  });
  toggle.className = 'resource-card-visibility';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(resource.teacher_visible));
  toggle.setAttribute('aria-label', 'Teacher Tools visibility for ' + resource.title);
  return toggle;
}

function savePreviewFolders() {
  localStorage.setItem(previewFolderKey, JSON.stringify({subfolders, placements:previewPlacements}));
}

function folderName(folder) {
  const parent = subfolders.find(item => item.id === folder.parent_id);
  return parent ? folderName(parent) + ' / ' + folder.name : folder.name;
}

async function organize(action) {
  if (organizing) return;
  organizing = true;
  try { await action(); render(); report(''); }
  catch (error) { report(error.message || 'Could not organize the resource.'); }
  finally { organizing = false; }
}

function destinations(item, isFolder) {
  const categoryId = folderCategoryId(categories, item.category_id);
  return subfolders.filter(folder => {
    if (folderCategoryId(categories, folder.category_id) !== categoryId) return false;
    if (item.organization_id !== folder.organization_id) return false;
    if (!isFolder) return true;
    for (let parent = folder; parent; parent = subfolders.find(candidate => candidate.id === parent.parent_id)) {
      if (parent.id === item.id) return false;
    }
    return true;
  });
}

function moveItem(item, isFolder, target) {
  return organize(async () => {
    if (target && !destinations(item, isFolder).includes(target)) throw Error('Choose a folder within the same category.');
    const field = isFolder ? 'parent_id' : 'folder_id';
    const value = target?.id ?? null;
    if ((item[field] ?? null) === value) return;
    const changes = {[field]:value};
    if (!isFolder && target) changes.category_id = target.category_id;
    if (tour()) {
      Object.assign(item, changes);
      if (!isFolder) previewPlacements[item.id] = changes;
      savePreviewFolders();
    } else {
      const table = isFolder ? 'resource_library_folders' : 'library_resources';
      const column = isFolder ? 'parent_id' : 'folder_id';
      let query = client().from(table).update(changes).eq('id',item.id);
      query = item[column] == null ? query.is(column,null) : query.eq(column,item[column]);
      Object.assign(item, await checked(query.select('*').single()));
    }
  });
}

function makeDraggable(node, item, isFolder) {
  node.draggable = true;
  node.ondragstart = event => {
    dragged = {item, isFolder};
    event.dataTransfer.setData('text/plain', item.id);
    event.dataTransfer.effectAllowed = 'move';
  };
  node.ondragend = () => { dragged = null; };
}

function acceptDrop(node, folder) {
  node.ondragover = event => {
    if (!dragged || !destinations(dragged.item, dragged.isFolder).includes(folder)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };
  node.ondrop = event => {
    if (!dragged) return;
    event.preventDefault();
    const {item, isFolder} = dragged;
    dragged = null;
    void moveItem(item, isFolder, folder);
  };
}

function moveControl(item, isFolder) {
  const select = element('select', '', 'resource-move-select');
  select.setAttribute('aria-label', 'Move ' + (isFolder ? item.name : item.title));
  select.append(option('', 'Move to…'), option('root', 'Category Home'),
    ...destinations(item, isFolder).map(folder => option(folder.id, folderName(folder))));
  select.onchange = () => {
    const value = select.value;
    select.value = '';
    if (value) void moveItem(item, isFolder, subfolders.find(folder => folder.id === value));
  };
  return select;
}

function folderActions(item) {
  const menu = element('details', '', 'resource-folder-actions');
  const trigger = element('summary', '⋯');
  trigger.setAttribute('aria-label', 'Actions for ' + item.name);
  const controls = element('div', '', 'resource-folder-action-panel');
  const rename = button('Rename Folder', () => {
    menu.open = false;
    openFolderDialog(item);
  });
  controls.append(rename, moveControl(item, true));
  menu.append(trigger, controls);
  menu.onkeydown = event => {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    trigger.focus();
  };
  return menu;
}

function renderFolders(resources, selectedCategory, searching) {
  const folders = $('#resource-folders');
  const header = $('#resource-folder-header');
  header.hidden = !selectedCategory;
  $('#resource-folder-back').textContent = activeFolder ? '← Up One Folder' : '← All Folders';
  const current = subfolders.find(folder => folder.id === activeFolder);
  $('#resource-folder-title').textContent = [category(selectedCategory), current && folderName(current)].filter(Boolean).join(' / ');
  folders.hidden = searching;
  folders.replaceChildren();
  if (folders.hidden) return;
  if (selectedCategory) {
    for (const item of subfolders.filter(folder => String(folderCategoryId(categories, folder.category_id)) === selectedCategory && folder.parent_id === activeFolder)) {
      const tile = element('article', '', 'resource-subfolder');
      const folder = button('', () => { activeFolder = item.id; render(); $('#resource-folder-back').focus(); });
      folder.className = 'resource-folder';
      const artwork = element('img', '', 'resource-folder-art');
      artwork.src = 'assets/resource-folders/subfolder.webp';
      artwork.alt = '';
      folder.append(artwork, element('strong', item.name));
      makeDraggable(folder, item, true);
      acceptDrop(folder, item);
      tile.append(folder, folderActions(item));
      folders.append(tile);
    }
    folders.hidden = !folders.children.length;
    return;
  }
  for (const item of categories) {
    const count = resources.filter(resource => folderCategoryId(categories, resource.category_id) === item.id).length;
    const folder = button('', () => {
      $('#resource-category').value = item.id;
      activeFolder = null;
      render();
      $('#resource-folder-back').focus();
    });
    folder.className = 'resource-folder resource-category-folder';
    const artwork = element('img', '', 'resource-folder-art');
    artwork.src = `assets/resource-folders/${item.art}.webp`;
    artwork.alt = '';
    folder.append(artwork, element('strong', item.name), element('span', item.description, 'resource-folder-description'),
      element('small', count + (count === 1 ? ' Resource' : ' Resources'), 'resource-folder-count'));
    folders.append(folder);
  }
}

function render() {
  const query = $('#resource-search').value.trim().toLowerCase();
  const type = $('#resource-visibility').value;
  const selectedCategory = $('#resource-category').value;
  const visible = resources.filter(resource => {
    if (type === 'archived' ? !resource.archived : resource.archived) return false;
    if (type === 'teacher' && !resource.teacher_visible || type === 'director' && resource.teacher_visible) return false;
    if (selectedCategory && String(folderCategoryId(categories, resource.category_id)) !== selectedCategory) return false;
    if (selectedCategory && !query && (resource.folder_id ?? null) !== activeFolder) return false;
    return [resource.title, resource.description, category(resource.category_id), resource.collection, ...resource.tags,
      resource.teacher_visible ? 'Teacher Tools' : ''].join(' ').toLowerCase().includes(query);
  });
  const gallery = $('#resource-gallery');
  gallery.replaceChildren();
  renderFolders(visible, selectedCategory, Boolean(query));
  if (!selectedCategory && !query) return;
  if (!visible.length) gallery.append(element('p', 'No resources match these filters.'));
  for (const resource of visible) {
    const card = element('article', '', 'resource-card');
    const open = button('', () => openDetail(resource));
    open.className = 'resource-card-open';
    const thumbnail = element('span', resource.files[0]?.name.split('.').at(-1)?.toUpperCase() || 'File', 'resource-type');
    open.append(element('strong', resource.title, 'resource-card-title'), thumbnail,
      element('small', category(resource.category_id)));
    const tags = element('div', '', 'resource-card-tags');
    for (const tag of resource.tags) tags.append(element('span', formatTag(tag)));
    makeDraggable(open, resource, false);
    card.append(open, tags, moveControl(resource, false), visibilityToggle(resource));
    gallery.append(card);
    if (/^image\/(png|jpeg|webp)$/.test(resource.files[0]?.type || '')) {
      fileUrl(resource.files[0]).then(url => {
        if (!card.isConnected) return;
        const image = element('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = url;
        thumbnail.replaceWith(image);
      }).catch(() => {});
    }
  }
}

const folderDefinitions = [
  ['marketing', 'Marketing & Enrollment', 'Enrollment promotions, flyers, advertising, referrals, and new dancer recruitment.', ['Marketing & Promotions']],
  ['parents', 'Parent Communications', 'Class reminders, announcements, safety information, tuition notices, and parent updates.', ['Parent Communications']],
  ['curriculum', 'Curriculum & Education', 'Ballet and tap instruction, dance skills, choreography, and educational resources.', ['Dance Education']],
  ['recital', 'Recital & Events', 'Recital announcements, costumes, rehearsals, performances, and special events.', ['Recital Resources', 'Holidays & Seasons']],
  ['music', 'Music & Media', 'Original songs, album artwork, playlists, instructional videos, and audio resources.', ['Music & Media']],
  ['brand', 'Brand & Creative Assets', 'Official logos, Tempo Tots characters, photo frames, backgrounds, and design templates.', ['Branding & Characters']],
  ['team', 'Teaching Team', 'Staff announcements, reminders, appreciation graphics, training, and internal communications.', ['Teaching Team Resources']],
  ['business', 'Business & Operations', 'School partnerships, administrative documents, policies, forms, and franchise resources.', ['Documents & Forms', 'School Partnerships', 'Franchise Operations']]
];

export const sampleCategories = ['Marketing & Promotions','Parent Communications','Dance Education','Recital Resources','Holidays & Seasons','Branding & Characters','Music & Media','Documents & Forms','School Partnerships','Franchise Operations','Teaching Team Resources'].map((name,index)=>({id:name === 'Teaching Team Resources' ? -1 : index+1,name}));

export function organizeCategories(rows) {
  return folderDefinitions.flatMap(([art, name, description, legacyNames]) => {
    const primary = rows.find(item => item.name === name) || rows.find(item => item.name === legacyNames[0]);
    if (!primary) return [];
    return [{id:primary.id, name, description, art, ids:rows.filter(item =>
      item.name === name || legacyNames.includes(item.name)).map(item => item.id)}];
  });
}

export function folderCategoryId(folders, id) {
  return folders.find(folder => folder.ids.some(member => String(member) === String(id)))?.id ?? '';
}

export async function load() {
  try {
    if (tour()) {
      categories = organizeCategories(sampleCategories);
      const saved = JSON.parse(localStorage.getItem(previewFolderKey) || '{}');
      subfolders = saved.subfolders || [];
      previewPlacements = saved.placements || {};
      if (!resources.length) resources = [{id:'sample',organization_id:'sample',title:'Dance Techniques Logo',description:'Sample branding resource for the library preview.',category_id:6,tags:['Branding'],collection:'',files:[{name:'Dance Techniques Logo.png',type:'image/png',sample:'assets/dance-techniques-logo-only.png'}],captions:[{name:'Teacher Reminder',text:'Please use the approved Dance Techniques logo on materials for {school_name}.'}],teacher_visible:true}];
    } else {
      if (!client() || !['director','admin'].includes(window.dtCurrentProfile?.role)) return;
      [categories, resources, subfolders] = await Promise.all([
        checked(client().from('resource_library_categories').select('id,name').order('id')),
        checked(client().from('library_resources').select('*').order('updated_at',{ascending:false})),
        checked(client().from('resource_library_folders').select('*').order('name'))
      ]);
    }
    if (!tour()) categories = organizeCategories(categories);
    else for (const resource of resources) Object.assign(resource, previewPlacements[resource.id]);
    const filter = $('#resource-category');
    const previous = filter.value;
    filter.replaceChildren(option('', 'All Categories'), ...categories.map(item => option(item.id,item.name)));
    filter.value = previous;
    report(tour() ? 'Sample Resource Library.' : '');
    render();
  } catch (error) { report('Resource Library could not load. ' + error.message); }
}
async function fileUrl(file, download = false) {
  if (file.sample) return file.sample;
  if (tour()) return demo.get(file.path);
  const storage = client().storage.from(bucket);
  if (download) return (await checked(storage.createSignedUrl(file.path, 60, {download:file.name}))).signedUrl;
  return (await checked(storage.createSignedUrl(file.path, 60))).signedUrl;
}

function showCaption(resource, select, copy, contexts) {
  copy.value = resource.captions[Number(select.value)]?.text || '';
  contexts.replaceChildren();
  function sync() {
    const existing = new Map([...contexts.querySelectorAll('input')].map(input=>[input.name,input]));
    const labels = captionFields(copy.value).map(token => {
      if (existing.has(token)) return existing.get(token).parentElement;
      const field = fields.find(([key])=>`{${key}}`===token);
      const label = element('label', field?.[1] || token);
      const input = element('input');
      input.name = token;
      input.value = field?.[2]?.() || '';
      label.append(input);
      return label;
    });
    contexts.replaceChildren(...labels);
  }
  copy.oninput = sync;
  sync();
}
function openDetail(resource) {
  const title = detail.querySelector('h3');
  const body = detail.querySelector('.resource-detail-body');
  title.textContent = resource.title;
  body.replaceChildren(element('p', resource.description),element('p', [category(resource.category_id),resource.collection,
    ...resource.tags,resource.teacher_visible ? 'Teacher Tools' : 'DD Only'].filter(Boolean).join(' · ')));
  const request = ++viewRequest;
  const preview = element('div', '', 'resource-file-preview');
  body.append(preview);
  const showFile = async file => {
    const current = ++viewRequest;
    preview.textContent = 'Opening preview…';
    try {
      if (!['image/png','image/jpeg','image/webp','video/mp4','audio/mpeg','application/pdf'].includes(file.type)) {
        preview.textContent = 'Download this file to view it.';
        return;
      }
      let url;
      if (!tour() && file.type === 'application/pdf') {
        const blob = await checked(client().storage.from(bucket).download(file.path));
        if (current !== viewRequest) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(new Blob([blob], {type:'application/pdf'}));
        url = objectUrl;
      } else url = await fileUrl(file);
      if (current !== viewRequest) return;
      const media = element(file.type.startsWith('image/') ? 'img' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'iframe');
      media.src = url;
      if (media.tagName === 'IMG') media.alt = file.name;
      if (['VIDEO','AUDIO'].includes(media.tagName)) media.controls = true;
      if (media.tagName === 'IFRAME') { media.title = file.name; media.setAttribute('sandbox',''); }
      preview.replaceChildren(media);
    } catch (error) { if (current === viewRequest) preview.textContent = error.message; }
  };
  for (const file of resource.files) {
    const row = element('div', '', 'resource-actions');
    row.append(element('span', file.label || file.name),button('Preview',()=>showFile(file)), button('Download', async () => {
      try {
        const link = element('a');
        link.href = await fileUrl(file,true);
        link.download = file.name;
        link.click();
      } catch(error) { preview.textContent = error.message; }
    }));
    body.append(row);
  }
  body.append(element('h4','Suggested Captions'));
  if (resource.captions.length) {
    const select = element('select');
    select.setAttribute('aria-label','Suggested Caption');
    select.replaceChildren(...resource.captions.map((caption,index)=>option(index,caption.name)));
    const label = element('label','Customize My Copy');
    const copy = element('textarea');
    label.append(copy);
    const contexts = element('div');
    const status = element('p');
    status.setAttribute('role','status');
    const result = element('p', '', 'resource-caption-preview');
    const personalized = () => personalizeCaption(copy.value, new Map([...contexts.querySelectorAll('input')].map(input=>[input.name,input.value.trim()])));
    const renderPreview = () => { result.textContent = personalized().text; };
    select.onchange = () => { showCaption(resource,select,copy,contexts); renderPreview(); };
    copy.addEventListener('input',renderPreview);
    contexts.addEventListener('input',renderPreview);
    showCaption(resource,select,copy,contexts);
    renderPreview();
    body.append(select,label,contexts,element('h5','Caption Preview'),result,button('Copy Caption', async () => {
      const { missing, text } = personalized();
      if (missing.length) { report('Fill in ' + missing.join(', ') + '.', status); return; }
      try {
        await navigator.clipboard.writeText(text);
        report('Caption copied.', status);
      } catch { report('Copy was unavailable. You can select and copy the text manually.',status); }
    }),status);
  } else body.append(element('p','No captions have been added.'));
  body.append(element('h4','Publishing History'),element('p','Resource Library publishing is not connected in this preview.'));
  const actions = element('div','','resource-actions');
  actions.append(button('Edit Resource',()=>{detail.close();openEditor(resource);}),button(resource.archived ? 'Restore' : 'Archive',async event=>{
    if (!confirm(resource.archived ? 'Restore this resource?' : 'Archive this resource?')) return;
    event.currentTarget.disabled = true;
    try {
      if (tour()) resource.archived = !resource.archived;
      else await checked(client().from('library_resources').update({archived:!resource.archived}).eq('id',resource.id).select('id').single());
      detail.close();
      await load();
    } catch (error) { body.append(element('p',error.message)); }
  }));
  body.append(actions);
  detail.showModal();
  if (request === viewRequest && resource.files[0]) void showFile(resource.files[0]);
}
detail.addEventListener('close',()=>{
  viewRequest++;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
});

function captionRow(caption = {}) {
  const row = element('fieldset');
  const name = element('input');
  name.placeholder = 'Caption Name';
  name.setAttribute('aria-label','Caption Name');
  name.required = true;
  name.value = caption.name || '';
  const text = element('textarea');
  text.setAttribute('aria-label','Official Caption');
  text.required = true;
  text.value = caption.text || '';
  const tokens = element('select');
  tokens.setAttribute('aria-label','Insert Personalization');
  tokens.replaceChildren(option('', 'Insert Personalization'), ...fields.map(([key,label])=>option(key,label)));
  tokens.onchange = () => {
    if (!tokens.value) return;
    text.setRangeText(`{${tokens.value}}`,text.selectionStart,text.selectionEnd,'end');
    tokens.value = '';
    text.focus();
  };
  row.append(name,text,tokens,button('Remove Caption',()=>{ if (confirm('Remove this caption when you save?')) row.remove(); }));
  return row;
}
function openEditor(resource) {
  editing = resource;
  draftId = resource?.id || crypto.randomUUID();
  versions = resource?.files.map(file=>({...file})) || [];
  pending = [];
  form.reset();
  form.elements.category.replaceChildren(option('', 'Choose a Category'), ...categories.map(item=>option(item.id,item.name)));
  form.elements.category.value = $('#resource-category').value;
  if (resource) {
    for (const field of ['title','description','collection']) form.elements[field].value = resource[field];
    form.elements.category.value = folderCategoryId(categories, resource.category_id);
    form.elements.tags.value = resource.tags.join(', ');
    form.elements.visible.checked = resource.teacher_visible;
  }
  $('#resource-captions').replaceChildren(...(resource?.captions || []).map(captionRow));
  renderVersions();
  report('', $('#resource-edit-status'));
  editor.querySelector('h3').textContent = resource ? 'Edit Resource' : 'Add Resource';
  editor.showModal();
}
function renderVersions() {
  const list = $('#resource-versions');
  list.replaceChildren();
  for (const file of [...versions,...pending]) {
    const row = element('div','','resource-actions');
    const label = element('input');
    label.setAttribute('aria-label', 'File Label for ' + file.name);
    label.placeholder = 'File Label';
    label.value = file.label || '';
    label.oninput = () => { file.label = label.value; };
    row.append(element('span',file.name),label,button('Remove',()=>{
      if (versions.includes(file) && !confirm('Remove this file version when you save?')) return;
      versions = versions.filter(entry=>entry!==file);
      pending = pending.filter(entry=>entry!==file);
      renderVersions();
    }));
    list.append(row);
  }
}
function addFiles(files) {
  if (busy) return;
  const status = $('#resource-edit-status');
  const incoming = [];
  for (const file of files) {
    const type = allowed[file.name.split('.').pop().toLowerCase()];
    if (!type || !file.size || file.size > 52428800) {
      report('Choose a supported file up to 50 MB. Check ' + file.name + '.',status);
      return;
    }
    incoming.push({file,name:file.name,type,size:file.size});
  }
  if (versions.length + pending.length + incoming.length > 20) {
    report('Use up to 20 file versions per resource.',status);
    return;
  }
  pending.push(...incoming);
  renderVersions();
  report('',status);
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { if (!busy) editor.close(); return; }
  if (busy) return;
  const status = $('#resource-edit-status');
  if (!versions.length && !pending.length) { report('Add at least one file.',status); return; }
  const values = new FormData(form);
  if (!category(values.get('category'))) { report('Choose a category before saving.', status); return; }
  const title = String(values.get('title')).trim();
  if (!title) { report('Enter a resource title.',status); return; }
  const tags = [...new Set(String(values.get('tags')).split(',').map(tag=>tag.trim()).filter(tag=>tag && tag.toLowerCase()!=='teacher tools'))];
  const captions = [...$('#resource-captions').children].map(row=>({
    name:row.querySelector('input').value.trim(),text:row.querySelector('textarea').value.trim()
  }));
  if (captions.some(caption=>!caption.name || !caption.text)) { report('Enter a name and text for every caption.',status); return; }
  busy = true;
  const body = editor.querySelector('.resource-detail-body');
  body.inert = true;
  const save = form.querySelector('[value="save"]');
  save.disabled = true;
  report('Saving resource…',status);
  try {
    const id = draftId;
    let org = editing?.organization_id || 'sample';
    if (!editing && !tour()) {
      const memberships = await checked(client().from('resource_library_members').select('organization_id').eq('can_manage',true));
      if (memberships.length !== 1) throw new Error('A single managing organization is required to add a resource.');
      org = memberships[0].organization_id;
    }
    const files = [...versions];
    for (const entry of pending) {
      const {file,name,type,size,label} = entry;
      if (!entry.path) {
        const path = `${org}/${id}/${crypto.randomUUID()}`;
        if (tour()) demo.set(path,URL.createObjectURL(file));
        else await checked(client().storage.from(bucket).upload(path,file,{contentType:type}));
        entry.path = path;
      }
      files.push({path:entry.path,name,type,size,label:label || ''});
    }
    const selectedCategory = Number(values.get('category'));
    const folder = subfolders.find(item => item.id === (editing ? editing.folder_id : activeFolder));
    const keepFolder = folder && folderCategoryId(categories, folder.category_id) === selectedCategory;
    const record = {category_id:keepFolder ? folder.category_id : selectedCategory,folder_id:keepFolder ? folder.id : null,title,description:values.get('description'),collection:values.get('collection'),tags,files,captions,teacher_visible:values.has('visible')};
    if (tour()) {
      resources = [{...editing,...record,id,organization_id:org},...resources.filter(item=>item.id!==id)];
      previewPlacements[id] = {folder_id:record.folder_id, category_id:record.category_id};
      savePreviewFolders();
    }
    else if (editing) await checked(client().from('library_resources').update(record).eq('id',id).eq('updated_at',editing.updated_at).select('id').single());
    else await checked(client().from('library_resources').insert({...record,id,organization_id:org}));
    editor.close();
    await load();
    report('Resource saved.');
  } catch(error) { report('Could not save the resource. ' + error.message,status); }
  finally { busy = false; body.inert = false; save.disabled = false; }
});
editor.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
const upload = $('#resource-drop');
upload.addEventListener('dragover',event=>event.preventDefault());
upload.addEventListener('drop',event=>{event.preventDefault();addFiles(event.dataTransfer.files);});
$('#resource-upload').onchange = event=>{addFiles(event.target.files);event.target.value='';};
$('#resource-add-caption').onclick = ()=>$('#resource-captions').append(captionRow());
$('#resource-add').onclick = ()=>openEditor();
$('#resource-folder-back').onclick = () => {
  if (activeFolder) activeFolder = subfolders.find(folder => folder.id === activeFolder)?.parent_id ?? null;
  else $('#resource-category').value = '';
  $('#resource-search').value = '';
  render();
  $('#resource-folders button')?.focus();
};
const folderDialog = $('#resource-folder-dialog');
const folderForm = folderDialog.querySelector('form');
const folderStatus = folderDialog.querySelector('[role="status"]');
const folderSubmit = folderForm.querySelector('[type="submit"]');
const folderCancel = folderForm.querySelector('[data-folder-cancel]');
let renamingFolder = null;
function openFolderDialog(folder = null) {
  renamingFolder = folder;
  folderForm.reset();
  folderForm.elements.folderName.value = folder?.name || '';
  $('#resource-folder-dialog-title').textContent = folder ? 'Rename Folder' : 'Add Folder';
  folderSubmit.textContent = folder ? 'Save Name' : 'Create Folder';
  folderStatus.hidden = true;
  folderDialog.showModal();
}
$('#resource-folder-add').onclick = () => openFolderDialog();
folderCancel.onclick = () => folderDialog.close();
folderDialog.addEventListener('cancel', event => {
  if (folderSubmit.disabled) event.preventDefault();
});
folderForm.onsubmit = async event => {
  event.preventDefault();
  if (organizing) return;
  const input = folderForm.elements.folderName;
  const name = input.value.trim();
  if (!name) {
    folderStatus.textContent = 'Enter a folder name.';
    folderStatus.hidden = false;
    input.focus();
    return;
  }
  const categoryId = Number($('#resource-category').value);
  const parent = subfolders.find(folder => folder.id === activeFolder);
  organizing = folderSubmit.disabled = folderCancel.disabled = true;
  folderStatus.hidden = true;
  try {
    if (renamingFolder) {
      const folder = renamingFolder;
      if (!tour() && name !== folder.name) {
        await checked(client().from('resource_library_folders').update({name})
          .eq('id', folder.id).eq('name', folder.name).select('id').single());
      }
      folder.name = name;
    } else {
      const memberships = tour() ? [{organization_id:'sample'}]
        : await checked(client().from('resource_library_members').select('organization_id').eq('can_manage',true));
      const organizationId = parent?.organization_id ?? (memberships.length === 1 ? memberships[0].organization_id : null);
      if (!organizationId) throw Error('A single managing organization is required to add a folder.');
      const record = {name, organization_id:organizationId, category_id:parent?.category_id ?? categoryId, parent_id:parent?.id ?? null};
      const folder = tour() ? {...record,id:crypto.randomUUID()}
        : await checked(client().from('resource_library_folders').insert(record).select('*').single());
      subfolders.push(folder);
    }
    if (tour()) savePreviewFolders();
    $('#resource-search').value = '';
    render();
    folderDialog.close();
    report(renamingFolder ? 'Folder renamed.' : 'Folder created.');
  } catch (error) {
    folderStatus.textContent = error.message || 'Could not create the folder. Try again.';
    folderStatus.hidden = false;
  } finally {
    organizing = folderSubmit.disabled = folderCancel.disabled = false;
  }
};
$('#resource-category').addEventListener('input', () => { activeFolder = null; render(); });
for (const selector of ['#resource-search','#resource-visibility']) $(selector).addEventListener('input',render);
new MutationObserver(()=>{
  if (document.body.dataset.adminSection === 'resource-library') void load();
}).observe(document.body,{attributes:true,attributeFilter:['data-admin-section']});
if (document.body.dataset.adminSection === 'resource-library') void load();

export function addPreviewResource(resource, files) {
  for (const [path, file] of files) {
    if (!demo.has(path)) demo.set(path,URL.createObjectURL(file));
  }
  resources = [{...resource,...previewPlacements[resource.id]},...resources.filter(item=>item.id!==resource.id)];
  render();
}
