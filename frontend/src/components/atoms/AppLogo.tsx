import React from 'react'
import { fetchDockerHubLogo } from '../../lib/dockerHub'

const LOGO_COLORS: Record<string, { bg: string; text: string }> = {
  redis: { bg: '#DC382D', text: '#FFFFFF' },
  postgres: { bg: '#336791', text: '#FFFFFF' },
  mysql: { bg: '#4479A1', text: '#FFFFFF' },
  mongodb: { bg: '#47A248', text: '#FFFFFF' },
  mariadb: { bg: '#CB4446', text: '#FFFFFF' },
  grafana: { bg: '#F46800', text: '#FFFFFF' },
  prometheus: { bg: '#E6522C', text: '#FFFFFF' },
  portainer: { bg: '#13BBEC', text: '#FFFFFF' },
  uptimkuma: { bg: '#5CDD8B', text: '#1F2937' },
  nginx: { bg: '#009639', text: '#FFFFFF' },
  traefik: { bg: '#24A1C1', text: '#FFFFFF' },
  minio: { bg: '#C72E49', text: '#FFFFFF' },
  registry: { bg: '#2496ED', text: '#FFFFFF' },
  nextcloud: { bg: '#0082C9', text: '#FFFFFF' },
  plex: { bg: '#EB564B', text: '#FFFFFF' },
  jellyfin: { bg: '#1A4C6D', text: '#FFFFFF' },
  homeassistant: { bg: '#41BDF5', text: '#FFFFFF' },
  adguard: { bg: '#468BD9', text: '#FFFFFF' },
  vaultwarden: { bg: '#175DDC', text: '#FFFFFF' },
  wordpress: { bg: '#21759B', text: '#FFFFFF' },
  ghost: { bg: '#738A94', text: '#FFFFFF' },
  strapi: { bg: '#4945FF', text: '#FFFFFF' },
  directus: { bg: '#263238', text: '#FFFFFF' },
  rabbitmq: { bg: '#FF6600', text: '#FFFFFF' },
  gitlab: { bg: '#FC6D26', text: '#FFFFFF' },
  gitea: { bg: '#E44D27', text: '#FFFFFF' },
  forgejo: { bg: '#D4462B', text: '#FFFFFF' },
  jenkins: { bg: '#D24939', text: '#FFFFFF' },
  drone: { bg: '#212121', text: '#FFFFFF' },
  woodpecker: { bg: '#1E90FF', text: '#FFFFFF' },
  argocd: { bg: '#EF7D55', text: '#FFFFFF' },
  harbor: { bg: '#60B932', text: '#FFFFFF' },
  sonarqube: { bg: '#4C8AD4', text: '#FFFFFF' },
  nexus: { bg: '#5B7BB4', text: '#FFFFFF' },
  tekton: { bg: '#2596D3', text: '#FFFFFF' },
  rancher: { bg: '#0075A8', text: '#FFFFFF' },
  k3s: { bg: '#326CE5', text: '#FFFFFF' },
  vault: { bg: '#000000', text: '#FFFFFF' },
  consul: { bg: '#E6388E', text: '#FFFFFF' },
  nomad: { bg: '#000000', text: '#FFFFFF' },
  terraform: { bg: '#7B42BC', text: '#FFFFFF' },
  ansible: { bg: '#EE0000', text: '#FFFFFF' },
  packer: { bg: '#1868F2', text: '#FFFFFF' },
  localstack: { bg: '#00A4FF', text: '#FFFFFF' },
  mattermost: { bg: '#0072C6', text: '#FFFFFF' },
  rocketchat: { bg: '#F5455C', text: '#FFFFFF' },
  element: { bg: '#000000', text: '#FFFFFF' },
  synapse: { bg: '#000000', text: '#FFFFFF' },
  zulip: { bg: '#50A050', text: '#FFFFFF' },
  jitsi: { bg: '#1676D0', text: '#FFFFFF' },
  bigbluebutton: { bg: '#283274', text: '#FFFFFF' },
  mumble: { bg: '#C94C4C', text: '#FFFFFF' },
  teamspeak: { bg: '#2D4B7A', text: '#FFFFFF' },
  signal: { bg: '#3A76F0', text: '#FFFFFF' },
  cockroachdb: { bg: '#6930C3', text: '#FFFFFF' },
  influxdb: { bg: '#439EFD', text: '#FFFFFF' },
  timescaledb: { bg: '#FDB813', text: '#000000' },
  clickhouse: { bg: '#FFCC00', text: '#000000' },
  couchdb: { bg: '#CE2227', text: '#FFFFFF' },
  couchbase: { bg: '#D4EDDA', text: '#000000' },
  cassandra: { bg: '#1287B1', text: '#FFFFFF' },
  scylladb: { bg: '#6F3CFA', text: '#FFFFFF' },
  arangodb: { bg: '#183145', text: '#FFFFFF' },
  neo4j: { bg: '#008CC1', text: '#FFFFFF' },
  orientdb: { bg: '#E38C00', text: '#FFFFFF' },
  rethinkdb: { bg: '#35A4DC', text: '#FFFFFF' },
  etcd: { bg: '#419B48', text: '#FFFFFF' },
  memcached: { bg: '#1B7FAD', text: '#FFFFFF' },
  postgresql: { bg: '#336791', text: '#FFFFFF' },
  mysql: { bg: '#4479A1', text: '#FFFFFF' },
  mariadb: { bg: '#CB4446', text: '#FFFFFF' },
  sqlite: { bg: '#003B57', text: '#FFFFFF' },
  yugabyte: { bg: '#E91E63', text: '#FFFFFF' },
  presto: { bg: '#E91E63', text: '#FFFFFF' },
  pgadmin: { bg: '#52777A', text: '#FFFFFF' },
  phpmyadmin: { bg: '#F58F44', text: '#FFFFFF' },
  adminer: { bg: '#3B7A57', text: '#FFFFFF' },
  dbeaver: { bg: '#3A8BC9', text: '#FFFFFF' },
  redisinsight: { bg: '#A82B2B', text: '#FFFFFF' },
  grafana: { bg: '#F46800', text: '#FFFFFF' },
  prometheus: { bg: '#E6522C', text: '#FFFFFF' },
  portainer: { bg: '#13BBEC', text: '#FFFFFF' },
  uptimkuma: { bg: '#5CDD8B', text: '#1F2937' },
  glances: { bg: '#3B7A57', text: '#FFFFFF' },
  netdata: { bg: '#50A050', text: '#FFFFFF' },
  loki: { bg: '#F46800', text: '#FFFFFF' },
  alertmanager: { bg: '#E6522C', text: '#FFFFFF' },
  thanos: { bg: '#3274C8', text: '#FFFFFF' },
  cadvisor: { bg: '#5B7A57', text: '#FFFFFF' },
  unifi: { bg: '#0671B8', text: '#FFFFFF' },
  speedtest: { bg: '#50A050', text: '#FFFFFF' },
  watchtower: { bg: '#3B7A57', text: '#FFFFFF' },
  cockpit: { bg: '#50A050', text: '#FFFFFF' },
  webmin: { bg: '#50A050', text: '#FFFFFF' },
  authentik: { bg: '#3289A8', text: '#FFFFFF' },
  authelia: { bg: '#1B8DB7', text: '#FFFFFF' },
  traefikforwardauth: { bg: '#3B7A57', text: '#FFFFFF' },
  wireguard: { bg: '#505050', text: '#FFFFFF' },
  openvpn: { bg: '#E87026', text: '#FFFFFF' },
  tailscale: { bg: '#7C3AED', text: '#FFFFFF' },
  crowdsec: { bg: '#3B7A57', text: '#FFFFFF' },
  fail2ban: { bg: '#505050', text: '#FFFFFF' },
  clamav: { bg: '#505050', text: '#FFFFFF' },
  keycloak: { bg: '#FF5C35', text: '#FFFFFF' },
  dex: { bg: '#3B7A57', text: '#FFFFFF' },
  oauth2proxy: { bg: '#3B7A57', text: '#FFFFFF' },
  casdoor: { bg: '#3874F0', text: '#FFFFFF' },
  logto: { bg: '#E001FF', text: '#FFFFFF' },
  homeassistant: { bg: '#41BDF5', text: '#FFFFFF' },
  iobroker: { bg: '#505050', text: '#FFFFFF' },
  openhab: { bg: '#5B7A57', text: '#FFFFFF' },
  nodered: { bg: '#8C0000', text: '#FFFFFF' },
  mosquitto: { bg: '#3B7A57', text: '#FFFFFF' },
  zigbee2mqtt: { bg: '#3B7A57', text: '#FFFFFF' },
  frigate: { bg: '#50A050', text: '#FFFFFF' },
  scrypted: { bg: '#505050', text: '#FFFFFF' },
  homebridge: { bg: '#3B7A57', text: '#FFFFFF' },
  caddy: { bg: '#2072A8', text: '#FFFFFF' },
  apache: { bg: '#D22128', text: '#FFFFFF' },
  haproxy: { bg: '#F9A825', text: '#000000' },
  varnish: { bg: '#F9A825', text: '#000000' },
  squid: { bg: '#505050', text: '#FFFFFF' },
  envoy: { bg: '#505050', text: '#FFFFFF' },
  nginxproxymanager: { bg: '#50A050', text: '#FFFFFF' },
  syncthing: { bg: '#505050', text: '#FFFFFF' },
  filebrowser: { bg: '#505050', text: '#FFFFFF' },
  owncloud: { bg: '#1B759A', text: '#FFFFFF' },
  seafile: { bg: '#3B7A57', text: '#FFFFFF' },
  pydio: { bg: '#505050', text: '#FFFFFF' },
  duplicati: { bg: '#505050', text: '#FFFFFF' },
  restic: { bg: '#505050', text: '#FFFFFF' },
  borg: { bg: '#505050', text: '#FFFFFF' },
  emby: { bg: '#A56B2E', text: '#FFFFFF' },
  radarr: { bg: '#F39C12', text: '#000000' },
  sonarr: { bg: '#1E7C9A', text: '#FFFFFF' },
  lidarr: { bg: '#50A050', text: '#FFFFFF' },
  readarr: { bg: '#50A050', text: '#FFFFFF' },
  qbittorrent: { bg: '#181717', text: '#FFFFFF' },
  transmission: { bg: '#2C2C2C', text: '#FFFFFF' },
  deluge: { bg: '#384CF0', text: '#FFFFFF' },
  tautulli: { bg: '#E5A50A', text: '#000000' },
  jackett: { bg: '#F39C12', text: '#000000' },
  bazarr: { bg: '#505050', text: '#FFFFFF' },
  overseerr: { bg: '#50A050', text: '#FFFFFF' },
  metube: { bg: '#E50914', text: '#FFFFFF' },
  sabnzbd: { bg: '#F39C12', text: '#000000' },
  nzbget: { bg: '#50A050', text: '#FFFFFF' },
  ombi: { bg: '#505050', text: '#FFFFFF' },
  photoprism: { bg: '#505050', text: '#FFFFFF' },
  immich: { bg: '#505050', text: '#FFFFFF' },
  librephotos: { bg: '#505050', text: '#FFFFFF' },
  piwigo: { bg: '#505050', text: '#FFFFFF' },
  snapdrop: { bg: '#505050', text: '#FFFFFF' },
  joomla: { bg: '#50A050', text: '#FFFFFF' },
  drupal: { bg: '#0678BE', text: '#FFFFFF' },
  grav: { bg: '#505050', text: '#FFFFFF' },
  hugo: { bg: '#50A050', text: '#FFFFFF' },
  keystone: { bg: '#50A050', text: '#FFFFFF' },
  sanity: { bg: '#F03C2E', text: '#FFFFFF' },
  prismic: { bg: '#505050', text: '#FFFFFF' },
  storyblak: { bg: '#505050', text: '#FFFFFF' },
  squidex: { bg: '#505050', text: '#FFFFFF' },
  apostrophe: { bg: '#505050', text: '#FFFFFF' },
  payload: { bg: '#505050', text: '#FFFFFF' },
  wikijs: { bg: '#50A050', text: '#FFFFFF' },
  bookstack: { bg: '#505050', text: '#FFFFFF' },
  xwiki: { bg: '#50A050', text: '#FFFFFF' },
  dokuwiki: { bg: '#505050', text: '#FFFFFF' },
  mediawiki: { bg: '#505050', text: '#FFFFFF' },
  n8n: { bg: '#505050', text: '#FFFFFF' },
  gotify: { bg: '#505050', text: '#FFFFFF' },
  ntfy: { bg: '#505050', text: '#FFFFFF' },
  calcom: { bg: '#505050', text: '#FFFFFF' },
  linkding: { bg: '#505050', text: '#FFFFFF' },
  shlink: { bg: '#505050', text: '#FFFFFF' },
  wallabag: { bg: '#505050', text: '#FFFFFF' },
  freshrss: { bg: '#505050', text: '#FFFFFF' },
  miniflux: { bg: '#505050', text: '#FFFFFF' },
  vikunja: { bg: '#505050', text: '#FFFFFF' },
  wekan: { bg: '#505050', text: '#FFFFFF' },
  plane: { bg: '#505050', text: '#FFFFFF' },
  kanboard: { bg: '#505050', text: '#FFFFFF' },
  trilium: { bg: '#505050', text: '#FFFFFF' },
  appwrite: { bg: '#505050', text: '#FFFFFF' },
  budibase: { bg: '#505050', text: '#FFFFFF' },
  tooljet: { bg: '#505050', text: '#FFFFFF' },
  appsmith: { bg: '#505050', text: '#FFFFFF' },
  umami: { bg: '#505050', text: '#FFFFFF' },
  plausible: { bg: '#505050', text: '#FFFFFF' },
  matomo: { bg: '#505050', text: '#FFFFFF' },
  countly: { bg: '#505050', text: '#FFFFFF' },
  posthog: { bg: '#505050', text: '#FFFFFF' },
  ackee: { bg: '#505050', text: '#FFFFFF' },
  fathom: { bg: '#505050', text: '#FFFFFF' },
  metabase: { bg: '#505050', text: '#FFFFFF' },
  superset: { bg: '#505050', text: '#FFFFFF' },
  redash: { bg: '#505050', text: '#FFFFFF' },
  jupyter: { bg: '#505050', text: '#FFFFFF' },
  rstudio: { bg: '#505050', text: '#FFFFFF' },
  codeserver: { bg: '#505050', text: '#FFFFFF' },
  streamlit: { bg: '#505050', text: '#FFFFFF' },
  mlflow: { bg: '#505050', text: '#FFFFFF' },
  dask: { bg: '#505050', text: '#FFFFFF' },
  kafka: { bg: '#F09C13', text: '#000000' },
  pulsar: { bg: '#F09C13', text: '#000000' },
  nats: { bg: '#505050', text: '#FFFFFF' },
  emqx: { bg: '#50A050', text: '#FFFFFF' },
  vernemq: { bg: '#505050', text: '#FFFFFF' },
  airflow: { bg: '#505050', text: '#FFFFFF' },
  prefect: { bg: '#505050', text: '#FFFFFF' },
  dagster: { bg: '#505050', text: '#FFFFFF' },
  temporal: { bg: '#505050', text: '#FFFFFF' },
  pipedream: { bg: '#505050', text: '#FFFFFF' },
  activepieces: { bg: '#505050', text: '#FFFFFF' },
  minecraft: { bg: '#62B47A', text: '#FFFFFF' },
  valheim: { bg: '#505050', text: '#FFFFFF' },
  terraria: { bg: '#505050', text: '#FFFFFF' },
  rust: { bg: '#DEA584', text: '#000000' },
  ark: { bg: '#505050', text: '#FFFFFF' },
  factorio: { bg: '#505050', text: '#FFFFFF' },
  cs2: { bg: '#DE9B35', text: '#000000' },
  csgo: { bg: '#DE9B35', text: '#000000' },
  gmod: { bg: '#DE9B35', text: '#000000' },
  l4d2: { bg: '#DE9B35', text: '#000000' },
  tf2: { bg: '#DE9B35', text: '#000000' },
  fivem: { bg: '#505050', text: '#FFFFFF' },
  redm: { bg: '#505050', text: '#FFFFFF' },
  palworld: { bg: '#505050', text: '#FFFFFF' },
  rustdesk: { bg: '#505050', text: '#FFFFFF' },
  pterodactyl: { bg: '#505050', text: '#FFFFFF' },
}

type AppLogoProps = {
  name: string
  image?: string
  /** Preset id for correct logo when image name is ambiguous */
  presetId?: string
  className?: string
}

export function AppLogo({ name, image, presetId, className = '' }: AppLogoProps) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  const colors = LOGO_COLORS[id] || { bg: '#6366F1', text: '#FFFFFF' }
  const initial = name.charAt(0).toUpperCase()

  return (
    <div
      className={`flex items-center justify-center rounded-lg overflow-hidden ${className}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {image ? (
        <DockerHubLogoFetcher image={image} presetId={presetId} fallbackColor={colors.bg} />
      ) : (
        <span className="text-sm font-bold">{initial}</span>
      )}
    </div>
  )
}

function DockerHubLogoFetcher({ image, presetId, fallbackColor }: { image: string; presetId?: string; fallbackColor: string }) {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchDockerHubLogo(image, presetId).then(url => {
      if (!cancelled && url) setLogoUrl(url)
    })
    return () => { cancelled = true }
  }, [image, presetId])

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={`w-full h-full object-contain p-1 ${loaded ? '' : 'hidden'}`}
        onLoad={() => setLoaded(true)}
      />
    )
  }

  return <span className="text-sm font-bold" style={{ color: fallbackColor }}>{image.charAt(0).toUpperCase()}</span>
}
