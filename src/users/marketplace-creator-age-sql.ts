/**
 * Fragmento SQL reutilizável: anos completos a partir de profile.birth_date.
 * Usar apenas com join em `profile` e com checagens de null / data futura no SELECT ou WHERE.
 */
export const AGE_YEARS_SQL =
  'EXTRACT(YEAR FROM AGE(CURRENT_DATE, profile.birth_date))';
