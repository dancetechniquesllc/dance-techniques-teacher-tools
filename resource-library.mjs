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
const category = id => categories.find(item => String(item.id) === String(id))?.name || '';
const report = (message, target = $('#resource-status')) => { target.textContent = message; };

function render() {
  const query = $('#resource-search').value.trim().toLowerCase();
  const type = $('#resource-visibility').value;
  const selectedCategory = $('#resource-category').value;
  const visible = resources.filter(resource => {
    if (type === 'archived' ? !resource.archived : resource.archived) return false;
    if (type === 'teacher' && !resource.teacher_visible || type === 'director' && resource.teacher_visible) return false;
    if (selectedCategory && String(resource.category_id) !== selectedCategory) return false;
    return [resource.title, resource.description, category(resource.category_id), resource.collection, ...resource.tags,
      resource.teacher_visible ? 'Teacher Tools' : ''].join(' ').toLowerCase().includes(query);
  });
  const gallery = $('#resource-gallery');
  gallery.replaceChildren();
  if (!visible.length) gallery.append(element('p', 'No resources match these filters.'));
  for (const resource of visible) {
    const card = button('', () => openDetail(resource));
    card.classList.add('resource-card');
    card.append(element('span', resource.files[0]?.name.split('.').at(-1)?.toUpperCase() || 'File', 'resource-type'),
      element('strong', resource.title), element('small', category(resource.category_id)),
      element('small', [...resource.tags, ...(resource.teacher_visible ? ['Teacher Tools'] : [])].join(' · ')));
    gallery.append(card);
    if (/^image\/(png|jpeg|webp)$/.test(resource.files[0]?.type || '')) {
      fileUrl(resource.files[0]).then(url => {
        if (!card.isConnected) return;
        const image = element('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = url;
        card.firstChild.replaceWith(image);
      }).catch(() => {});
    }
  }
}

export const sampleCategories = ['Marketing & Promotions','Parent Communications','Dance Education','Recital Resources','Holidays & Seasons','Branding & Characters','Music & Media','Documents & Forms','School Partnerships','Franchise Operations','Teaching Team Resources'].map((name,index)=>({id:name === 'Teaching Team Resources' ? -1 : index+1,name}));
export async function load() {
  try {
    if (tour()) {
      categories = sampleCategories;
      if (!resources.length) resources = [{id:'sample',organization_id:'sample',title:'Dance Techniques Logo',description:'Sample branding resource for the library preview.',category_id:6,tags:['Branding'],collection:'',files:[{name:'Dance Techniques Logo.png',type:'image/png',sample:'assets/dance-techniques-logo-only.png'}],captions:[{name:'Teacher Reminder',text:'Please use the approved Dance Techniques logo on materials for {school_name}.'}],teacher_visible:true}];
    } else {
      if (!client() || !['director','admin'].includes(window.dtCurrentProfile?.role)) return;
      [categories, resources] = await Promise.all([
        checked(client().from('resource_library_categories').select('id,name').order('id')),
        checked(client().from('library_resources').select('*').order('updated_at',{ascending:false}))
      ]);
    }
    const filter = $('#resource-category');
    const previous = filter.value;
    filter.replaceChildren(option('', 'All Categories'), ...categories.map(item => option(item.id,item.name)));
    filter.value = previous;
    report(tour() ? 'Sample library. Changes reset when you refresh.' : '');
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
  form.elements.category.replaceChildren(...categories.map(item=>option(item.id,item.name)));
  if (resource) {
    for (const field of ['title','description','collection']) form.elements[field].value = resource[field];
    form.elements.category.value = resource.category_id;
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
    const record = {category_id:Number(values.get('category')),title,description:values.get('description'),collection:values.get('collection'),tags,files,captions,teacher_visible:values.has('visible')};
    if (tour()) resources = [{...editing,...record,id,organization_id:org},...resources.filter(item=>item.id!==id)];
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
for (const selector of ['#resource-search','#resource-category','#resource-visibility']) $(selector).addEventListener('input',render);
new MutationObserver(()=>{
  if (document.body.dataset.adminSection === 'resource-library') void load();
}).observe(document.body,{attributes:true,attributeFilter:['data-admin-section']});
if (document.body.dataset.adminSection === 'resource-library') void load();

export function addPreviewResource(resource, files) {
  for (const [path, file] of files) {
    if (!demo.has(path)) demo.set(path,URL.createObjectURL(file));
  }
  resources = [resource,...resources.filter(item=>item.id!==resource.id)];
  render();
}
