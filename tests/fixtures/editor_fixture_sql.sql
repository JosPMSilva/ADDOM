create table if not exists fixture_metrics (
  id integer primary key,
  name text not null,
  value integer not null
);

insert into fixture_metrics (name, value) values ('alpha', 3);
select name, value from fixture_metrics order by value desc;
