/** Walk immutable IDs so the API row cap cannot silently truncate an entire board. */
export async function fetchAllRowsById(makeQuery, pageSize = 200) {
  const rows = [];
  let cursor = null;
  while (true) {
    let query = makeQuery().order('id', { ascending: true }).limit(pageSize);
    if (cursor !== null) query = query.gt('id', cursor);
    const result = await query;
    if (result?.error) throw result.error;
    if (!Array.isArray(result?.data)) throw new Error('Invalid page response');
    if (!result.data.length) return rows;
    for (const row of result.data) {
      if (typeof row?.id !== 'string' || !row.id || (cursor !== null && row.id <= cursor)) throw new Error('Invalid pagination cursor');
      cursor = row.id;
      rows.push(row);
    }
    // Exact count refers to the remaining ID range, including this page.
    if (typeof result.count === 'number' && result.count === result.data.length) return rows;
    if (result.count == null && result.data.length < pageSize) return rows;
  }
}
