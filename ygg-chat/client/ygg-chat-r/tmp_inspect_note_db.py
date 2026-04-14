import os
import sqlite3

path = os.path.join(os.environ['APPDATA'], 'graviton', 'local-sync.db')
print(f'DB={path}')
conn = sqlite3.connect(path)
cur = conn.cursor()
queries = [
    'select count(*) from note_search_docs',
    'select count(*) from note_search_embedding_state',
    'select id, embedding_model, embedding_dimensions, vector_table_name from note_search_vector_config',
    'select user_id, count(*) from note_search_docs group by user_id order by count(*) desc limit 10',
    "select message_id, user_id, substr(note,1,120) from note_search_docs where note like '%vector%' limit 10",
]
for q in queries:
    print('QUERY:', q)
    try:
        rows = list(cur.execute(q))
        for row in rows:
            print(row)
    except Exception as e:
        print('ERR', e)
