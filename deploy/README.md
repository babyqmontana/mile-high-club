# Выкладка на VPS

Сервер: Ubuntu, сайт и бот в службе `mhc`, снаружи nginx.

- Первая настройка: `bash /opt/mhc/deploy/setup.sh` от root.
- Журнал: `journalctl -u mhc -f`.
- Перезапуск: `systemctl restart mhc`.
- https: `certbot --nginx -d mhc-ls-project.ru -d www.mhc-ls-project.ru`, когда домен указывает на сервер.
- База и загрузки лежат в `/opt/mhc/data`. При обновлении кода эту папку и `.env` не заменять.
