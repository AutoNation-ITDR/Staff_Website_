require "digest"
require "fileutils"
require "json"
require "net/http"
require "securerandom"
require "sqlite3"
require "time"
require "uri"
require "webrick"

ROOT = File.expand_path(__dir__)
DATA_DIR = File.join(ROOT, "data")
DB_PATH = File.join(DATA_DIR, "staff_panel.sqlite3")
HOST = ENV.fetch("HOST", "0.0.0.0")
PORT = ENV.fetch("PORT", "4567").to_i
FALLBACK_AVATAR = "https://tr.rbxcdn.com/180DAY-6f5f2d2f73728d0f0d3a56d98d0d2178/150/150/AvatarHeadshot/Png"

FileUtils.mkdir_p(DATA_DIR)

DB = SQLite3::Database.new(DB_PATH)
DB.results_as_hash = true
DB.busy_timeout = 5000

SESSIONS = {}

def sha256(text)
  Digest::SHA256.hexdigest(text)
end

def iso_now
  Time.now.iso8601
end

def hours_from_now(hours)
  (Time.now + (hours * 3600)).iso8601
end

def boolean_flag(value)
  value.to_i == 1
end

def create_schema
  DB.execute_batch(
    <<~SQL
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        roblox_name TEXT,
        avatar_url TEXT,
        online INTEGER NOT NULL DEFAULT 0,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        temp_password_plain TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY,
        roblox_name TEXT NOT NULL UNIQUE,
        warns INTEGER NOT NULL DEFAULT 0,
        active_ban_until TEXT,
        last_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        player_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        automatic INTEGER NOT NULL DEFAULT 0
      );
    SQL
  )
end

def seed_database
  existing = DB.get_first_value("SELECT COUNT(*) FROM users").to_i
  return if existing.positive?

  DB.execute(
    "INSERT INTO users (username, password_hash, display_name, role, roblox_name, avatar_url, online, must_change_password, temp_password_plain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["admin", sha256("password123"), "Admin Houston", "Manager", "Builderman", FALLBACK_AVATAR, 0, 0, ""]
  )
  DB.execute(
    "INSERT INTO users (username, password_hash, display_name, role, roblox_name, avatar_url, online, must_change_password, temp_password_plain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["moderatore", sha256("mod123"), "Moderatore RP", "Moderatore", "Roblox", FALLBACK_AVATAR, 0, 0, ""]
  )
  DB.execute(
    "INSERT INTO users (username, password_hash, display_name, role, roblox_name, avatar_url, online, must_change_password, temp_password_plain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["alex.manager", sha256("manager123"), "Alex Ranger", "Amministratore", "Alexnewtron", FALLBACK_AVATAR, 0, 0, ""]
  )

  DB.execute(
    "INSERT INTO players (id, roblox_name, warns, active_ban_until, last_reason) VALUES (?, ?, ?, ?, ?)",
    [1, "Luca_RP", 2, nil, "Fail RP leggero"]
  )
  DB.execute(
    "INSERT INTO players (id, roblox_name, warns, active_ban_until, last_reason) VALUES (?, ?, ?, ?, ?)",
    [2, "TexasDriver", 3, hours_from_now(18), "Powergaming"]
  )
  DB.execute(
    "INSERT INTO players (id, roblox_name, warns, active_ban_until, last_reason) VALUES (?, ?, ?, ?, ?)",
    [3, "SheriffMax", 1, nil, "Comportamento tossico"]
  )
  DB.execute(
    "INSERT INTO players (id, roblox_name, warns, active_ban_until, last_reason) VALUES (?, ?, ?, ?, ?)",
    [4, "RancherJoe", 4, hours_from_now(32), "VDM ripetuto"]
  )

  create_log("warn", "Luca_RP", "Fail RP leggero", "Admin Houston", nil, false)
  create_log("ban", "TexasDriver", "Powergaming", "Admin Houston", hours_from_now(18), true)
  create_log("kick", "SheriffMax", "Richiamo verbale ignorato", "Moderatore RP", nil, false)
end

def create_log(type, player_name, reason, staff_name, expires_at, automatic)
  DB.execute(
    "INSERT INTO logs (type, player_name, reason, staff_name, created_at, expires_at, automatic)
     VALUES (?, ?, ?, ?, ?, ?, ?)",
    [type, player_name, reason, staff_name, iso_now, expires_at, automatic ? 1 : 0]
  )
end

def parse_body(req)
  body = req.body.to_s.strip
  return {} if body.empty?

  JSON.parse(body)
rescue JSON::ParserError
  nil
end

def send_json(res, status, payload)
  res.status = status
  res["Content-Type"] = "application/json; charset=utf-8"
  res.body = JSON.generate(payload)
end

def session_cookie(req)
  req.cookies.find { |cookie| cookie.name == "staff_session" }
end

def current_user(req)
  cookie = session_cookie(req)
  return nil unless cookie

  user_id = SESSIONS[cookie.value]
  return nil unless user_id

  DB.get_first_row("SELECT * FROM users WHERE id = ?", [user_id])
end

def serialize_user(row, manager_view)
  {
    id: row["id"],
    username: row["username"],
    displayName: row["display_name"],
    role: row["role"],
    robloxName: row["roblox_name"],
    avatar: row["avatar_url"],
    online: boolean_flag(row["online"]),
    mustChangePassword: boolean_flag(row["must_change_password"]),
    tempPasswordPlain: manager_view ? row["temp_password_plain"].to_s : ""
  }
end

def serialize_player(row)
  {
    id: row["id"],
    robloxName: row["roblox_name"],
    warns: row["warns"],
    activeBanUntil: row["active_ban_until"],
    lastReason: row["last_reason"]
  }
end

def serialize_log(row)
  {
    id: row["id"],
    type: row["type"],
    playerName: row["player_name"],
    reason: row["reason"],
    staffName: row["staff_name"],
    createdAt: row["created_at"],
    expiresAt: row["expires_at"],
    automatic: boolean_flag(row["automatic"])
  }
end

def normalize_expirations
  expired = DB.execute(
    "SELECT id, roblox_name FROM players
     WHERE active_ban_until IS NOT NULL
     AND datetime(active_ban_until) <= datetime('now')"
  )

  expired.each do |player|
    DB.execute("UPDATE players SET active_ban_until = NULL WHERE id = ?", [player["id"]])
    create_log("ban", player["roblox_name"], "Sbannamento automatico a scadenza", "Sistema", nil, true)
  end
end

def log_command(command_name, params, staff_name)
  target = params["username"].to_s.strip
  target = "N/A" if target.empty?
  detail = params.reject { |k, _| k == "username" }.map { |k, v| "#{k}:#{v}" }.join(" ")
  DB.execute(
    "INSERT INTO logs (type, player_name, reason, staff_name, created_at, expires_at, automatic)
     VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["command", target, command_name + (detail.empty? ? "" : " " + detail), staff_name, iso_now, nil, 0]
  )
end

def state_payload(user_row)
  normalize_expirations
  manager_view = user_row["role"] == "Manager"
  users = DB.execute("SELECT * FROM users ORDER BY display_name ASC").map { |row| serialize_user(row, manager_view) }
  players = DB.execute("SELECT * FROM players ORDER BY id ASC").map { |row| serialize_player(row) }
  logs = DB.execute("SELECT * FROM logs ORDER BY datetime(created_at) DESC, id DESC LIMIT 100").map { |row| serialize_log(row) }

  {
    currentUser: serialize_user(user_row, manager_view),
    users: users,
    players: players,
    logs: logs
  }
end

def password_valid?(password)
  password.length >= 8 &&
    password.match?(/[A-Z]/) &&
    password.match?(/\d/) &&
    password.match?(/[^A-Za-z0-9]/)
end

def fetch_json(uri, req)
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") do |http|
    response = http.request(req)
    JSON.parse(response.body)
  end
end

def fetch_roblox_avatar(username)
  return FALLBACK_AVATAR if username.to_s.strip.empty?

  users_uri = URI("https://users.roblox.com/v1/usernames/users")
  users_request = Net::HTTP::Post.new(users_uri)
  users_request["Content-Type"] = "application/json"
  users_request.body = JSON.generate({ usernames: [username], excludeBannedUsers: false })
  users_data = fetch_json(users_uri, users_request)
  user_id = users_data.dig("data", 0, "id")
  return FALLBACK_AVATAR unless user_id

  thumb_uri = URI("https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=#{user_id}&size=150x150&format=Png&isCircular=false")
  thumb_request = Net::HTTP::Get.new(thumb_uri)
  thumb_data = fetch_json(thumb_uri, thumb_request)
  thumb_data.dig("data", 0, "imageUrl") || FALLBACK_AVATAR
rescue StandardError
  FALLBACK_AVATAR
end

def require_auth(req, res)
  user = current_user(req)
  return user if user

  send_json(res, 401, { error: "Non autenticato" })
  nil
end

def require_manager(req, res)
  user = require_auth(req, res)
  return nil unless user

  return user if user["role"] == "Manager"

  send_json(res, 403, { error: "Accesso negato" })
  nil
end

create_schema
seed_database

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: HOST,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

server.mount_proc "/" do |req, res|
  case [req.request_method, req.path]
  when ["GET", "/"]
    res["Content-Type"] = "text/html; charset=utf-8"
    res.body = File.read(File.join(ROOT, "index.html"))
  when ["GET", "/api/state"]
    user = require_auth(req, res)
    next unless user

    send_json(res, 200, state_payload(user))
  when ["POST", "/api/login"]
    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    username = body["username"].to_s.strip
    password = body["password"].to_s
    user = DB.get_first_row("SELECT * FROM users WHERE username = ?", [username])

    if user.nil? || user["password_hash"] != sha256(password)
      send_json(res, 401, { error: "Credenziali non valide" })
      next
    end

    session_id = SecureRandom.hex(32)
    SESSIONS[session_id] = user["id"]
    DB.execute("UPDATE users SET online = 1 WHERE id = ?", [user["id"]])
    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])

    cookie = WEBrick::Cookie.new("staff_session", session_id)
    cookie.path = "/"
    res.cookies << cookie
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/logout"]
    user = current_user(req)
    if user
      DB.execute("UPDATE users SET online = 0 WHERE id = ?", [user["id"]])
      cookie = session_cookie(req)
      SESSIONS.delete(cookie.value) if cookie
    end

    expired_cookie = WEBrick::Cookie.new("staff_session", "")
    expired_cookie.path = "/"
    expired_cookie.expires = Time.at(0)
    res.cookies << expired_cookie
    send_json(res, 200, { ok: true })
  when ["POST", "/api/moderation"]
    user = require_auth(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    player = DB.get_first_row("SELECT * FROM players WHERE id = ?", [body["playerId"].to_i])
    unless player
      send_json(res, 404, { error: "Giocatore non trovato" })
      next
    end

    action = body["action"].to_s
    reason = body["reason"].to_s.strip
    reason = "Motivo non specificato" if reason.empty?
    expires_at = nil

    if action == "warn"
      new_warns = player["warns"].to_i + 1
      DB.execute("UPDATE players SET warns = ?, last_reason = ? WHERE id = ?", [new_warns, reason, player["id"]])

      if new_warns == 3
        expires_at = hours_from_now(24)
        DB.execute("UPDATE players SET active_ban_until = ? WHERE id = ?", [expires_at, player["id"]])
        create_log("ban", player["roblox_name"], "Auto-ban intelligente: 3 warn", "Sistema", expires_at, true)
      elsif new_warns == 5
        expires_at = hours_from_now(48)
        DB.execute("UPDATE players SET active_ban_until = ? WHERE id = ?", [expires_at, player["id"]])
        create_log("ban", player["roblox_name"], "Auto-ban intelligente: 5 warn", "Sistema", expires_at, true)
      end
    elsif action == "kick"
      DB.execute("UPDATE players SET last_reason = ? WHERE id = ?", [reason, player["id"]])
    elsif action == "ban"
      ban_hours = body["banHours"].to_i
      ban_hours = 24 if ban_hours <= 0
      expires_at = hours_from_now(ban_hours)
      DB.execute("UPDATE players SET active_ban_until = ?, last_reason = ? WHERE id = ?", [expires_at, reason, player["id"]])
    else
      send_json(res, 400, { error: "Azione non valida" })
      next
    end

    create_log(action, player["roblox_name"], reason, user["display_name"], expires_at, false)
    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/profile"]
    user = require_auth(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    display_name = body["displayName"].to_s.strip
    roblox_name = body["robloxName"].to_s.strip
    display_name = user["display_name"] if display_name.empty?
    roblox_name = user["roblox_name"] if roblox_name.empty?
    avatar_url = fetch_roblox_avatar(roblox_name)

    DB.execute(
      "UPDATE users SET display_name = ?, roblox_name = ?, avatar_url = ? WHERE id = ?",
      [display_name, roblox_name, avatar_url, user["id"]]
    )

    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/password"]
    user = require_auth(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    password = body["password"].to_s
    unless password_valid?(password)
      send_json(res, 422, { error: "Password non valida" })
      next
    end

    DB.execute(
      "UPDATE users SET password_hash = ?, must_change_password = 0, temp_password_plain = '' WHERE id = ?",
      [sha256(password), user["id"]]
    )

    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/staff"]
    user = require_manager(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    username = body["username"].to_s.strip
    roblox_name = body["robloxName"].to_s.strip
    display_name = body["displayName"].to_s.strip
    role = body["role"].to_s.strip
    temp_password = body["tempPassword"].to_s

    if [username, roblox_name, display_name, role, temp_password].any?(&:empty?)
      send_json(res, 422, { error: "Compila tutti i campi" })
      next
    end

    if DB.get_first_row("SELECT id FROM users WHERE username = ?", [username])
      send_json(res, 409, { error: "Username gia esistente" })
      next
    end

    avatar_url = fetch_roblox_avatar(roblox_name)
    DB.execute(
      "INSERT INTO users (username, password_hash, display_name, role, roblox_name, avatar_url, online, must_change_password, temp_password_plain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [username, sha256(temp_password), display_name, role, roblox_name, avatar_url, 0, 1, temp_password]
    )

    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/staff/toggle-online"]
    user = require_manager(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    username = body["username"].to_s.strip
    target = DB.get_first_row("SELECT * FROM users WHERE username = ?", [username])
    unless target
      send_json(res, 404, { error: "Staff non trovato" })
      next
    end

    next_value = boolean_flag(target["online"]) ? 0 : 1
    DB.execute("UPDATE users SET online = ? WHERE id = ?", [next_value, target["id"]])
    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["POST", "/api/commands/execute"]
    user = require_auth(req, res)
    next unless user

    body = parse_body(req)
    if body.nil?
      send_json(res, 400, { error: "JSON non valido" })
      next
    end

    command_name = body["command"].to_s.strip
    params = body["params"].is_a?(Hash) ? body["params"] : {}

    if command_name.empty?
      send_json(res, 422, { error: "Comando non specificato" })
      next
    end

    log_command(command_name, params, user["display_name"])
    user = DB.get_first_row("SELECT * FROM users WHERE id = ?", [user["id"]])
    send_json(res, 200, state_payload(user))
  when ["GET", "/api/roblox/search"]
    user = require_auth(req, res)
    next unless user

    username = URI.decode_www_form(req.query_string.to_s).to_h["username"].to_s.strip
    if username.empty?
      send_json(res, 422, { error: "Username richiesto" })
      next
    end

    avatar_url = fetch_roblox_avatar(username)
    send_json(res, 200, { username: username, avatarUrl: avatar_url })
  else
    res.status = 404
    res["Content-Type"] = "text/plain; charset=utf-8"
    res.body = "Not found"
  end
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

puts "Houston Staff Panel in ascolto su http://#{HOST}:#{PORT}"
server.start
