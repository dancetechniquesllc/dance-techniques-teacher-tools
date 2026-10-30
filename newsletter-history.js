/* In-memory Undo snapshots share large strings. Saved drafts remain ordinary JSON. */
(function (scope) {
  function createNewsletterHistoryCodec() {
    const values = new Map();
    const ids = new Map();
    let nextId = 0;
    const marker = '__dtNewsletterHistoryString';
    function pack(draft) {
      // Tuples keep application objects distinct from internal string references.
      const encode = value => {
        if (typeof value === 'string' && value.length >= 2048) {
          let id = ids.get(value);
          if (!id) { id = ++nextId; ids.set(value, id); values.set(id, value); }
          return [marker, id];
        }
        if (Array.isArray(value)) return ['array', value.map(encode)];
        if (value && typeof value === 'object') return ['object', Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,encode(v)])];
        return ['value', value];
      };
      return JSON.stringify(encode(draft));
    }
    function unpack(snapshot) {
      const decode = tuple => {
        if (tuple[0] === marker) {
          if (!values.has(tuple[1])) throw new Error('Newsletter undo image unavailable');
          return values.get(tuple[1]);
        }
        if (tuple[0] === 'array') return tuple[1].map(decode);
        if (tuple[0] === 'object') return Object.fromEntries(tuple[1].map(([k,v]) => [k,decode(v)]));
        return tuple[1];
      };
      return decode(JSON.parse(snapshot));
    }
    function references(snapshots) {
      const used = new Set();
      const visit = tuple => {
        if (tuple[0] === marker) used.add(tuple[1]);
        else if (tuple[0] === 'array') tuple[1].forEach(visit);
        else if (tuple[0] === 'object') tuple[1].forEach(([,v]) => visit(v));
      };
      snapshots.forEach(snapshot => visit(JSON.parse(snapshot)));
      return used;
    }
    function bytes(snapshots) {
      let total = snapshots.reduce((sum, snapshot) => sum + snapshot.length * 2, 0);
      references(snapshots).forEach(id => { total += (values.get(id)?.length || 0) * 2; });
      return total;
    }
    function trim(current, undo, redo, budget = 32 * 1024 * 1024) {
      // Preserve current draft regardless of size; bound additional Undo memory.
      const limit = bytes([current]) + budget;
      const snapshots = () => [current, ...undo, ...redo];
      while (undo.length + redo.length > 80 || bytes(snapshots()) > limit) {
        if (undo.length) undo.shift();
        else if (redo.length) redo.shift();
        else break;
      }
      const used = references(snapshots());
      for (const [id, value] of values) if (!used.has(id)) { values.delete(id); ids.delete(value); }
    }
    return {pack, unpack, trim, bytes};
  }
  scope.createNewsletterHistoryCodec = createNewsletterHistoryCodec;
})(typeof window === 'undefined' ? globalThis : window);
