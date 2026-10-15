-- Date of birth (optional). With it the age is exact; without it the age is estimated from the birth year.
alter table people add column if not exists birth_date date;
