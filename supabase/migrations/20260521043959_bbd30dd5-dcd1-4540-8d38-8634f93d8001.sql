DROP POLICY IF EXISTS "records_select" ON records;
DROP POLICY IF EXISTS "records_insert" ON records;
DROP POLICY IF EXISTS "records_update" ON records;
DROP POLICY IF EXISTS "records_delete" ON records;
DROP POLICY IF EXISTS "Couple can update records" ON records;
DROP POLICY IF EXISTS "Author can update records" ON records;
DROP POLICY IF EXISTS "Author can insert records" ON records;
DROP POLICY IF EXISTS "Author can delete records" ON records;
DROP POLICY IF EXISTS "Couple can view records" ON records;

CREATE POLICY "records_select" ON records
FOR SELECT USING (
  couple_id = (SELECT couple_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "records_insert" ON records
FOR INSERT WITH CHECK (
  couple_id = (SELECT couple_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "records_update" ON records
FOR UPDATE 
USING (
  couple_id = (SELECT couple_id FROM users WHERE id = auth.uid())
)
WITH CHECK (
  couple_id = (SELECT couple_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "records_delete" ON records
FOR DELETE USING (
  author_id = auth.uid()
);

ALTER TABLE records ENABLE ROW LEVEL SECURITY;