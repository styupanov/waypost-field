// Catalog metadata only: no rows, owners, ACLs, roles, or credentials are collected.
const tables = `SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')`;

export async function readSchema(client) {
  const queries = {
    tables: `SELECT relname AS name,relkind AS kind FROM pg_class WHERE oid IN (${tables}) ORDER BY relname`,
    columns: `SELECT c.relname AS relation,a.attnum AS position,a.attname AS name,
        format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,
        a.attidentity AS identity,a.attgenerated AS generated,
        pg_get_expr(d.adbin,d.adrelid) AS default_expression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE c.oid IN (${tables}) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    constraints: `SELECT conrelid::regclass::text AS relation,conname AS name,contype AS type,
        pg_get_constraintdef(oid,true) AS definition
      FROM pg_constraint WHERE conrelid IN (${tables}) AND contype IN ('p','f','u','c','x')
      ORDER BY conrelid::regclass::text,conname`,
    indexes: `SELECT t.relname AS relation,c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,
        i.indisvalid AS valid,i.indisready AS ready
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
      WHERE t.oid IN (${tables}) ORDER BY t.relname,c.relname`,
    spatial: `SELECT 'geometry' AS storage,f_table_name AS relation,f_geometry_column AS name,type,srid,coord_dimension AS dimensions
        FROM geometry_columns WHERE f_table_schema='public'
      UNION ALL SELECT 'geography',f_table_name,f_geography_column,type,srid,coord_dimension
        FROM geography_columns WHERE f_table_schema='public'
      ORDER BY relation,name`,
    triggers: `SELECT c.relname AS relation,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.oid IN (${tables}) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    functions: `SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e')
      ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`,
  };
  const result = {};
  for (const [name, sql] of Object.entries(queries)) result[name] = (await client.query(sql)).rows;
  return result;
}

export function schemaDifferences(reference, actual) {
  return Object.keys(reference).flatMap((section) => {
    const expected = new Set(reference[section].map((row) => JSON.stringify(row)));
    const found = new Set(actual[section].map((row) => JSON.stringify(row)));
    return [
      ...[...expected].filter((row) => !found.has(row)).map((row) => ({ section, missing: JSON.parse(row) })),
      ...[...found].filter((row) => !expected.has(row)).map((row) => ({ section, unexpected: JSON.parse(row) })),
    ];
  });
}
