1. Confirm timezone and running containers
```
timedatectl
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml ps
docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'
git rev-parse HEAD
```
### Output:
Sun Jun  7 19:29:51 +08 2026
               Local time: Sun 2026-06-07 19:29:51 +08
           Universal time: Sun 2026-06-07 11:29:51 UTC
                 RTC time: Sun 2026-06-07 11:29:51
                Time zone: Asia/Kuala_Lumpur (+08, +0800)
System clock synchronized: yes
              NTP service: active
          RTC in local TZ: no
NAME                         IMAGE                                COMMAND                  SERVICE           CREATED          STATUS                    PORTS
bayarlah-caddy-1             caddy:2.10.2-alpine                  "caddy run --config …"   caddy             18 hours ago     Up 6 hours (unhealthy)    0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp, 443/udp, 2019/tcp
bayarlah-openwa-api-1        ghcr.io/rmyndharis/openwa:0.1.6      "/usr/local/bin/open…"   openwa-api        17 hours ago     Up 6 hours (healthy)      2785/tcp
bayarlah-whatsapp-worker-1   bayarlah-whatsapp-worker:novacloud   "docker-entrypoint.s…"   whatsapp-worker   44 seconds ago   Up 39 seconds (healthy)
9d8d2faa8be4    bayarlah-whatsapp-worker-1      bayarlah-whatsapp-worker:novacloud      Up 39 seconds (healthy)
dc75e3f39c85    bayarlah-openwa-api-1   ghcr.io/rmyndharis/openwa:0.1.6 Up 6 hours (healthy)
1ad5d00f4aa0    bayarlah-caddy-1        caddy:2.10.2-alpine     Up 6 hours (unhealthy)
81c12d81651f661d26878349f61fdb7e19581ce9

2.Retrieve worker logs
```
docker compose --env-file .env.novacloud \
  -f docker-compose.novacloud.yml logs \
  --since '2026-06-07T12:55:00+08:00' \
  --until '2026-06-07T13:20:00+08:00' \
  --timestamps whatsapp-worker
```
### Output:
nothing

Also retrieve OpenWA logs:
```
docker compose --env-file .env.novacloud \
  -f docker-compose.novacloud.yml logs \
  --since '2026-06-07T12:55:00+08:00' \
  --until '2026-06-07T13:20:00+08:00' \
  --timestamps openwa-api
```
### Output;
openwa-api-1  | 2026-06-07T05:10:11.593931658Z [Bootstrap] Loading saved configuration from: /app/data/.env.generated
openwa-api-1  | 2026-06-07T05:10:11.597102458Z ◇ injected env (6) from data/.env.generated // tip: ⌘ override existing { override: true }
openwa-api-1  | 2026-06-07T05:10:11.924936414Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [NestFactory] Starting Nest application...
openwa-api-1  | 2026-06-07T05:10:11.968936872Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] AppModule dependencies initialized +43ms
openwa-api-1  | 2026-06-07T05:10:11.968973039Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:11.968977203Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:11.968980806Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] HooksModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:11.968984314Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] LoggerModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:11.968987484Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] DockerModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:11.970090015Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] ConfigHostModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:11.970329346Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] HealthModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:11.987141755Z {"timestamp":"2026-06-07T05:10:11.975Z","level":"info","context":"CacheService","message":"CacheService: enabled=false, REDIS_ENABLED=false"}
openwa-api-1  | 2026-06-07T05:10:11.988056229Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] ConfigModule dependencies initialized +17ms
openwa-api-1  | 2026-06-07T05:10:11.988981774Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] ConfigModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:11.989164333Z [Nest] 8  - 06/07/2026, 5:10:11 AM     LOG [InstanceLoader] SettingsModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.034598067Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] CacheModule dependencies initialized +45ms
openwa-api-1  | 2026-06-07T05:10:12.034837561Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] StorageModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.035677481Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] PluginsModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.036662284Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] ThrottlerModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.036680144Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] EngineModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.036684716Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] PluginsApiModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.162687241Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmCoreModule dependencies initialized +126ms
openwa-api-1  | 2026-06-07T05:10:12.162748388Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.162762814Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.163303396Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] EventsModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.163440071Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] AuditModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.163674160Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] AuthModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.164288953Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] InfraModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.165314974Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmCoreModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165328044Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165333000Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165337538Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165342020Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] TypeOrmModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165727787Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] ContactModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.165744423Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] GroupModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165750682Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] LabelModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165756397Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] ChannelModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165850002Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] WebhookModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.165864211Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] StatsModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.166256731Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] StatusModule dependencies initialized +1ms
openwa-api-1  | 2026-06-07T05:10:12.166296890Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] CatalogModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.166303720Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] MessageModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.166309381Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [InstanceLoader] SessionModule dependencies initialized +0ms
openwa-api-1  | 2026-06-07T05:10:12.261247505Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [EventsGateway] WebSocket Gateway initialized
openwa-api-1  | 2026-06-07T05:10:12.261942778Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [WebSocketsController] EventsGateway subscribed to the "message" message +0ms
openwa-api-1  | 2026-06-07T05:10:12.263571802Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] AuditController {/api/audit}: +2ms
openwa-api-1  | 2026-06-07T05:10:12.265884521Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/audit, GET} route +2ms
openwa-api-1  | 2026-06-07T05:10:12.265900543Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] AuthController {/api/auth/api-keys}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.266468328Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.266723187Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.267088550Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys/:id, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.267461111Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys/:id, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.269942764Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys/:id, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.269959379Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/api-keys/:id/revoke, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.269963453Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] AuthValidateController {/api/auth}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.270035683Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/auth/validate, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.270040502Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] SessionController {/api/sessions}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.270043768Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270046962Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.270050157Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270053373Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270056600Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id/start, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270060246Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id/stop, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270066901Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id/qr, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270166683Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:id/groups, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.270405024Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/stats/overview, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.270430315Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] WebhookController {/api/sessions/:sessionId/webhooks}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.270694988Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271860999Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271909038Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks/:id, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.271913831Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks/:id, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271917333Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks/:id/test, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271920791Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/webhooks/:id, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271924128Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] WebhooksListController {/api/webhooks}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.271927452Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/webhooks, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.271930748Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] MessageController {/api/sessions/:sessionId/messages}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.271998228Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.272215791Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-text, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.272433848Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-image, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.272648889Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-video, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.273871728Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-audio, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.273891828Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-document, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.273898068Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-location, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.273953947Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-contact, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.273961038Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-sticker, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.273979652Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/reply, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.274130031Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/forward, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.274332550Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/react, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275846349Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/:chatId/:messageId/reactions, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275862186Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/delete, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275866790Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-bulk, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275870898Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/batch/:batchId, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.275874835Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/batch/:batchId/cancel, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275878684Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] HealthController {/api/health}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.275919892Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/health, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275924503Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/health/live, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275942584Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/health/ready, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.275947755Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] SettingsController {/api/settings}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.276135076Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/settings, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.276297061Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/settings, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.276479914Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] InfraController {/api/infra}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.276759493Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/status, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.276961309Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/engines, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.277822536Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/engines/current, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.277837835Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/config, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.277842446Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/restart, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.277846345Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/health, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.277850187Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/export-data, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.277917384Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/import-data, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279774491Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/storage/files/count, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.279807244Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/storage/export, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279825040Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/infra/storage/import, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279829436Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] ContactController {/api/sessions/:sessionId/contacts}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.279833387Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279852601Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts/:contactId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279856656Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts/check/:number, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279860644Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts/:contactId/profile-picture, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.279864581Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts/:contactId/block, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279868425Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/contacts/:contactId/block, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.279872329Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] GroupController {/api/sessions/:sessionId/groups}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.280071257Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.280309461Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.280524322Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.280728598Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/participants, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.280943470Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/participants, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.281120617Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/participants/promote, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.281349114Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/participants/demote, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.281524536Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/subject, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.281740884Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/description, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.281930183Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/leave, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.282126800Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/invite-code, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.282295421Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/groups/:groupId/invite-code/revoke, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.282389013Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] LabelController {/api/sessions/:sessionId/labels}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.282573791Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/labels, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.282770725Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/labels/:labelId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.283018188Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/labels/chat/:chatId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.283258585Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/labels/chat/:chatId, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.283499889Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/labels/chat/:chatId/:labelId, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.283578291Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] ChannelController {/api/sessions/:sessionId/channels}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.283823452Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/channels, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.284083906Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/channels/:channelId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.284307367Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/channels/:channelId/messages, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.284529648Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/channels/subscribe, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.284730205Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/channels/:channelId, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.284811835Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] StatsController {/api/stats}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.284998073Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/stats/overview, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.285856186Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/stats/messages, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.285866806Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/stats/sessions/:sessionId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.285869423Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] StatusController {/api/sessions/:sessionId/status}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.285871762Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.285874053Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status/:contactId, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.285926004Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status/send-text, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.286143082Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status/send-image, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.286278157Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status/send-video, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.286420317Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/status/:statusId, DELETE} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.286477571Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] CatalogController {/api/sessions/:sessionId}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.286758174Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/catalog, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.286904629Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/catalog/products, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.287131165Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/catalog/products/:productId, GET} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.289162855Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-product, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.289232289Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/sessions/:sessionId/messages/send-catalog, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.289279192Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RoutesResolver] PluginsController {/api/plugins}: +0ms
openwa-api-1  | 2026-06-07T05:10:12.289583577Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.289772656Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins/:id, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.289964527Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins/:id/enable, POST} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.290154378Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins/:id/disable, POST} route +1ms
openwa-api-1  | 2026-06-07T05:10:12.290351522Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins/:id/config, PUT} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.290532765Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [RouterExplorer] Mapped {/api/plugins/:id/health, GET} route +0ms
openwa-api-1  | 2026-06-07T05:10:12.292953054Z {"timestamp":"2026-06-07T05:10:12.292Z","level":"info","context":"PluginLoaderService","message":"Loaded 0 plugins","action":"plugins_loaded","count":0}
openwa-api-1  | 2026-06-07T05:10:12.298507942Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.298633417Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}
openwa-api-1  | 2026-06-07T05:10:12.298709188Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.298798915Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":"  🟢 Welcome to OpenWA - WhatsApp API Gateway"}
openwa-api-1  | 2026-06-07T05:10:12.298813584Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.298920115Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":"  📊 Dashboard: http://localhost:2886"}
openwa-api-1  | 2026-06-07T05:10:12.299100819Z {"timestamp":"2026-06-07T05:10:12.298Z","level":"info","context":"AuthService","message":"  📚 API Docs:  http://localhost:2785/api/docs"}
openwa-api-1  | 2026-06-07T05:10:12.299186347Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.299193665Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":"  🔑 API Key:"}
openwa-api-1  | 2026-06-07T05:10:12.299199022Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":"     [REDACTED - ROTATE THIS KEY]"}
openwa-api-1  | 2026-06-07T05:10:12.299204320Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.299257950Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}
openwa-api-1  | 2026-06-07T05:10:12.299341491Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"AuthService","message":""}
openwa-api-1  | 2026-06-07T05:10:12.299949342Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"PluginLoaderService","message":"[whatsapp-web.js] WhatsApp-web.js engine plugin loaded","pluginId":"whatsapp-web.js"}
openwa-api-1  | 2026-06-07T05:10:12.300134748Z {"timestamp":"2026-06-07T05:10:12.299Z","level":"info","context":"PluginLoaderService","message":"[whatsapp-web.js] WhatsApp-web.js engine plugin enabled","pluginId":"whatsapp-web.js"}
openwa-api-1  | 2026-06-07T05:10:12.300150471Z {"timestamp":"2026-06-07T05:10:12.300Z","level":"info","context":"PluginLoaderService","message":"Plugin enabled: WhatsApp Web.js Engine","pluginId":"whatsapp-web.js","action":"plugin_enabled"}
openwa-api-1  | 2026-06-07T05:10:12.300213504Z {"timestamp":"2026-06-07T05:10:12.300Z","level":"info","context":"EngineFactory","message":"Engine plugin enabled: whatsapp-web.js","action":"engine_enabled","engineType":"whatsapp-web.js"}
openwa-api-1  | 2026-06-07T05:10:12.312867668Z [Nest] 8  - 06/07/2026, 5:10:12 AM    WARN [DockerService] Docker socket not available. Container orchestration disabled.
openwa-api-1  | 2026-06-07T05:10:12.312907494Z [Nest] 8  - 06/07/2026, 5:10:12 AM    WARN [DockerService] connect ENOENT /var/run/docker.sock
openwa-api-1  | 2026-06-07T05:10:12.312929732Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [DockerService] [Bootstrap Orchestration] Docker not available, skipping
openwa-api-1  | 2026-06-07T05:10:12.329984626Z {"timestamp":"2026-06-07T05:10:12.328Z","level":"info","context":"SessionService","message":"Reset 1 session(s) to disconnected on startup","action":"startup_reset","affected":1}
openwa-api-1  | 2026-06-07T05:10:12.336737723Z [Nest] 8  - 06/07/2026, 5:10:12 AM     LOG [NestApplication] Nest application successfully started +24ms
openwa-api-1  | 2026-06-07T05:10:12.341056192Z 🚀 OpenWA is running on: http://localhost:2785
openwa-api-1  | 2026-06-07T05:10:12.341143908Z 📚 Swagger docs: http://localhost:2785/api/docs
openwa-api-1  | 2026-06-07T05:11:07.586750399Z {"timestamp":"2026-06-07T05:11:07.585Z","level":"info","context":"SessionService","message":"Initializing engine for session: bayarlah-bot","sessionId":"bd3fbd42-8063-4fd6-8ef0-192b5c2b190e","action":"engine_init","proxyEnabled":false}
openwa-api-1  | 2026-06-07T05:11:18.398604264Z {"timestamp":"2026-06-07T05:11:18.396Z","level":"info","context":"SessionService","message":"Session ready: 601121576217","sessionId":"bd3fbd42-8063-4fd6-8ef0-192b5c2b190e","phone":"601121576217","pushName":"BayarLah Bot","action":"ready"}

3. Inspect recent OpenWA message metadata
```
docker compose --env-file .env.novacloud \
  -f docker-compose.novacloud.yml exec -T whatsapp-worker \
  node --input-type=module -e '
import fs from "node:fs";
const key = fs.readFileSync("/openwa-data/.api-key", "utf8").trim();
const base = "http://openwa-api:2785/api";
const headers = {"X-API-Key": key};
const rawSessions = await (await fetch(base + "/sessions", {headers})).json();
const sessions = Array.isArray(rawSessions) ? rawSessions : rawSessions.data ?? [];
for (const session of sessions) {
  const raw = await (await fetch(base + "/sessions/" + session.id + "/messages?limit=30", {headers})).json();
  const messages = Array.isArray(raw) ? raw : raw.data?.messages ?? raw.data ?? raw.messages ?? [];
  console.log(JSON.stringify(messages.map(m => ({
    id: m.id ?? m.messageId ?? m._serialized,
    from: m.from,
    chatId: m.chatId,
    type: m.type,
    mimetype: m.mimetype ?? m.mimeType,
    fromMe: m.fromMe,
    direction: m.direction,
    hasMedia: m.hasMedia,
    timestamp: m.timestamp
  })), null, 2));
}'
```

### Output:
```
[
  {
    "id": "1b575d50-d660-4150-9238-ada0294cbd6c",
    "from": "601121576217",
    "chatId": "120869741424737@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780822570
  },
  {
    "id": "5e99958b-9d39-47c3-8f17-fdd8cd5db87d",
    "from": "601121576217",
    "chatId": "120869741424737@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780822570
  },
  {
    "id": "3f166a24-01ed-47cf-9e72-ba7fd6d2867f",
    "from": "601121576217",
    "chatId": "120869741424737@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780822570
  },
  {
    "id": "5f769904-5bd6-40b9-ad92-28bc40f06f76",
    "from": "601121576217",
    "chatId": "120869741424737@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780822570
  },
  {
    "id": "8d56d06f-66a1-4eb0-8f52-d167c2501f69",
    "from": "601121576217",
    "chatId": "203654598496490@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780809081
  },
  {
    "id": "d19120a7-b193-4bae-b51a-b9b5f52f11ad",
    "from": "601121576217",
    "chatId": "203654598496490@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780809081
  },
  {
    "id": "7e1f8a78-6f3a-4c8a-9128-594d9b889378",
    "from": "601121576217",
    "chatId": "601139010186@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780809080
  },
  {
    "id": "7170e7a5-8e3e-4077-8bd2-68f840e93352",
    "from": "601121576217",
    "chatId": "60197407561@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780783778
  },
  {
    "id": "685ba717-03d6-4cb2-a09c-c45fe9fdf69f",
    "from": "601121576217",
    "chatId": "60197407561@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780780163
  },
  {
    "id": "9fbd1918-3f0d-40f9-a455-01b757528c96",
    "from": "601121576217",
    "chatId": "60197407561@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780776547
  },
  {
    "id": "8c152716-18f7-4e06-a29b-9e363250e675",
    "from": "601121576217",
    "chatId": "60197407561@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780772932
  },
  {
    "id": "386bc296-612b-4b86-8b54-fe769ed4aed4",
    "from": "601121576217",
    "chatId": "60138652983@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780769558
  },
  {
    "id": "9ddb6ceb-a28a-4b14-84aa-bdf9810831d1",
    "from": "601121576217",
    "chatId": "39049960141010@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769446
  },
  {
    "id": "7c167dac-0b7b-44e1-9acb-e97362f16a19",
    "from": "601121576217",
    "chatId": "39049960141010@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769446
  },
  {
    "id": "219b04e3-176c-4f4f-afb5-905f53f14dcd",
    "from": "601121576217",
    "chatId": "601162206107@c.us",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769446
  },
  {
    "id": "30cdee99-421c-40a7-a531-e2ee4c25c341",
    "from": "601121576217",
    "chatId": "60189144217@c.us",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769446
  },
  {
    "id": "6d314f48-e852-4eb4-9e31-5c438f0da41f",
    "from": "601121576217",
    "chatId": "601162206107@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780769317
  },
  {
    "id": "bfe79633-da71-4350-a99a-527e14e7d4ea",
    "from": "601121576217",
    "chatId": "104067208609819@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769315
  },
  {
    "id": "17680d99-bddd-4581-8c23-3162784964d2",
    "from": "601121576217",
    "chatId": "104067208609819@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769315
  },
  {
    "id": "7407cd66-d1a1-47dc-bb90-6111fc5f8c18",
    "from": "601121576217",
    "chatId": "60138652983@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780769316
  },
  {
    "id": "57092298-cabc-4c7b-8317-25be33a74301",
    "from": "601121576217",
    "chatId": "248189097623562@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769313
  },
  {
    "id": "b3dcee99-4890-4bfb-b2d5-268631d9d8ec",
    "from": "601121576217",
    "chatId": "248189097623562@lid",
    "type": "text",
    "direction": "outgoing",
    "timestamp": 1780769313
  },
  {
    "id": "3bc5cf1a-600f-42b7-8ee9-58775de8ff71",
    "from": "601121576217",
    "chatId": "60197407561@c.us",
    "type": "image",
    "direction": "outgoing",
    "timestamp": 1780769314
  }
]
```

4. Retrieve database records

| id                        | expenseShareId            | status | senderSessionId                      | whatsappChatId    | whatsappLidChatId   | providerMessageId                               | createdAt               | sentAt                  | errorMessage |
| ------------------------- | ------------------------- | ------ | ------------------------------------ | ----------------- | ------------------- | ----------------------------------------------- | ----------------------- | ----------------------- | ------------ |
| cmq3bqvbu0001102lilvsr36g | cmq3ak2fc0009o75h7a2cyg0w | SENT   | bd3fbd42-8063-4fd6-8ef0-192b5c2b190e | 601139010186@c.us | 203654598496490@lid | true_203654598496490@lid_3EB07744232A4DA62311E0 | 2026-06-07 05:11:18.803 | 2026-06-07 05:11:20.984 | null         |

second one no output
