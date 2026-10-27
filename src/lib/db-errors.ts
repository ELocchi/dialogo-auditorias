// Version conflicts raised by our SQL functions. PT409 is current; 40001 remains accepted
// until every environment has applied 20261027000200_conflict_sqlstate.sql.
export function isConflictCode(code: string | null | undefined) {
  return code === "PT409" || code === "40001";
}
