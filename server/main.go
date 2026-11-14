package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type animation struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type game struct {
	ID          string    `json:"id"`
	OwnerID     string    `json:"ownerId,omitempty"`
	Code        string    `json:"code,omitempty"`
	CodeExpires time.Time `json:"codeExpires,omitempty"`
	Paired      bool      `json:"paired"`
	Drawn       []int     `json:"drawn"`
	Theme       string    `json:"theme"`
	Animation   animation `json:"animation"`
	Revision    int64     `json:"revision"`
}

type account struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"passwordHash"`
	Role         string    `json:"role"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"createdAt"`
}

type accountView struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
}

func (u account) view() accountView {
	return accountView{u.ID, u.Username, u.Role, u.Active, u.CreatedAt}
}

type session struct {
	UserID  string
	Expires time.Time
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,63}$`)

type app struct {
	mu       sync.Mutex
	dataDir  string
	distDir  string
	rootDir  string
	secure   bool
	games    map[string]*game
	users    map[string]*account
	sessions map[string]session
	watchers map[string]map[chan []byte]bool
	failed   map[string][]time.Time
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func token(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func writeUsers(dataDir string, users map[string]*account) error {
	b, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(dataDir, "users.tmp")
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dataDir, "users.json"))
}

func (a *app) loadUsers() error {
	path := filepath.Join(a.dataDir, "users.json")
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &a.users); err != nil {
			return err
		}
		if len(a.users) == 0 {
			return errors.New("No hay cuentas en users.json")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	legacyHash, err := os.ReadFile(filepath.Join(a.dataDir, "owner.hash"))
	if err != nil {
		return errors.New("Falta la cuenta owner: ejecuta owner bootstrap")
	}
	a.users["bingo"] = &account{ID: token(16), Username: "bingo", PasswordHash: strings.TrimSpace(string(legacyHash)), Role: "owner", Active: true, CreatedAt: time.Now()}
	return writeUsers(a.dataDir, a.users)
}

func (a *app) ownerLocked() *account {
	for _, u := range a.users {
		if u.Role == "owner" {
			return u
		}
	}
	return nil
}

func (a *app) userByIDLocked(id string) *account {
	for _, u := range a.users {
		if u.ID == id {
			return u
		}
	}
	return nil
}

func main() {
	data := env("BINGO_DATA_DIR", ".local/data")
	if (len(os.Args) == 3 || len(os.Args) == 4) && os.Args[1] == "owner" && os.Args[2] == "bootstrap" {
		if err := os.MkdirAll(data, 0700); err != nil {
			log.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(data, "users.json")); err == nil {
			log.Println("La cuenta ya existe.")
			return
		}
		if _, err := os.Stat(filepath.Join(data, "owner.hash")); err == nil {
			log.Println("La cuenta ya existe.")
			return
		}
		username := "bingo"
		if len(os.Args) == 4 {
			username = strings.ToLower(strings.TrimSpace(os.Args[3]))
		}
		if !usernamePattern.MatchString(username) {
			log.Fatal("Usuario inválido")
		}
		password, err := io.ReadAll(io.LimitReader(os.Stdin, 4096))
		if err != nil {
			log.Fatal(err)
		}
		password = []byte(strings.TrimSpace(string(password)))
		if len(password) < 12 {
			log.Fatal("La contraseña debe tener al menos 12 caracteres")
		}
		hash, err := bcrypt.GenerateFromPassword(password, bcrypt.DefaultCost)
		if err != nil {
			log.Fatal(err)
		}
		users := map[string]*account{username: {ID: token(16), Username: username, PasswordHash: string(hash), Role: "owner", Active: true, CreatedAt: time.Now()}}
		if err := writeUsers(data, users); err != nil {
			log.Fatal(err)
		}
		log.Println("Cuenta creada.")
		return
	}
	if err := os.MkdirAll(data, 0700); err != nil {
		log.Fatal(err)
	}
	a := &app{dataDir: data, distDir: env("BINGO_DIST_DIR", "dist"), rootDir: env("BINGO_ROOT_DIR", "."), secure: os.Getenv("BINGO_SECURE_COOKIES") == "1", games: map[string]*game{}, users: map[string]*account{}, sessions: map[string]session{}, watchers: map[string]map[chan []byte]bool{}, failed: map[string][]time.Time{}}
	if err := a.loadUsers(); err != nil {
		log.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(a.dataDir, "games.json")); err == nil {
		if err := json.Unmarshal(data, &a.games); err != nil {
			log.Fatal(err)
		}
	}
	// La primera versión tenía una sola cuenta y ningún dueño en cada TV.
	for _, g := range a.games {
		if g.Paired && g.OwnerID == "" {
			if owner := a.ownerLocked(); owner != nil {
				g.OwnerID = owner.ID
			}
		}
	}
	if err := a.saveLocked(); err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/logout", a.logout)
	mux.HandleFunc("GET /api/auth/me", a.me)
	mux.HandleFunc("GET /api/users", a.listUsers)
	mux.HandleFunc("POST /api/users", a.createUser)
	mux.HandleFunc("PUT /api/users/{username}/password", a.changePassword)
	mux.HandleFunc("PATCH /api/users/{username}", a.updateUser)
	mux.HandleFunc("GET /api/tv/init", a.tvInit)
	mux.HandleFunc("GET /api/tv/events", a.tvEvents)
	mux.HandleFunc("POST /api/pair", a.pair)
	mux.HandleFunc("GET /api/remote/state", a.remoteState)
	mux.HandleFunc("GET /api/remote/tvs", a.remoteTVs)
	mux.HandleFunc("POST /api/remote/select", a.remoteSelect)
	mux.HandleFunc("GET /api/remote/events", a.remoteEvents)
	mux.HandleFunc("POST /api/remote/action", a.action)
	mux.HandleFunc("GET /api/cards/preview", a.cards)
	mux.HandleFunc("GET /api/cards/pdf", a.cards)
	mux.HandleFunc("/", a.static)
	bind := env("BINGO_BIND", "127.0.0.1")
	port := env("PORT", "3012")
	log.Printf("Bingo escucha en %s:%s", bind, port)
	log.Fatal(http.ListenAndServe(bind+":"+port, mux))
}

func (a *app) cookie(w http.ResponseWriter, name, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.secure, MaxAge: age})
}
func readCookie(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}
func jsonReply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func bad(w http.ResponseWriter, status int, msg string) {
	jsonReply(w, status, map[string]string{"error": msg})
}
func decode(r *http.Request, out any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return errors.New("Se requiere JSON")
	}
	return json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(out)
}
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	return err == nil && u.Host == r.Host && (u.Scheme == "https" || u.Scheme == "http")
}
func (a *app) currentUser(r *http.Request) (account, bool) {
	t := readCookie(r, "bingo_user")
	a.mu.Lock()
	s, ok := a.sessions[t]
	u := a.userByIDLocked(s.UserID)
	var result account
	if u != nil {
		result = *u
	}
	a.mu.Unlock()
	return result, t != "" && ok && u != nil && result.Active && time.Now().Before(s.Expires)
}
func (a *app) requireUser(w http.ResponseWriter, r *http.Request) (account, bool) {
	u, ok := a.currentUser(r)
	if !ok {
		bad(w, 401, "Inicia sesión para usar el control.")
	}
	return u, ok
}
func (a *app) requireOwner(w http.ResponseWriter, r *http.Request) (account, bool) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return u, false
	}
	if u.Role != "owner" {
		bad(w, 403, "Solo el administrador puede gestionar usuarios.")
		return u, false
	}
	return u, true
}
func (a *app) require(w http.ResponseWriter, r *http.Request) bool {
	_, ok := a.requireUser(w, r)
	return ok
}
func (a *app) health(w http.ResponseWriter, _ *http.Request) {
	jsonReply(w, 200, map[string]string{"status": "ok"})
}
func (a *app) login(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if parsed := net.ParseIP(ip); parsed != nil && parsed.IsLoopback() {
		if forwarded := net.ParseIP(r.Header.Get("X-Real-IP")); forwarded != nil {
			ip = forwarded.String()
		}
	}
	a.mu.Lock()
	var recent []time.Time
	for _, t := range a.failed[ip] {
		if time.Since(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	a.failed[ip] = recent
	blocked := len(recent) >= 5
	a.mu.Unlock()
	if blocked {
		bad(w, 429, "Espera un minuto antes de reintentar.")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	a.mu.Lock()
	candidate := a.users[username]
	dummy := a.ownerLocked()
	var hash string
	var candidateID string
	var candidateActive bool
	var candidateView accountView
	if dummy != nil {
		hash = dummy.PasswordHash
	}
	if candidate != nil {
		hash = candidate.PasswordHash
		candidateID = candidate.ID
		candidateActive = candidate.Active
		candidateView = candidate.view()
	}
	a.mu.Unlock()
	valid := bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password)) == nil
	if candidateID == "" || !candidateActive || !valid {
		a.mu.Lock()
		a.failed[ip] = append(a.failed[ip], time.Now())
		a.mu.Unlock()
		bad(w, 401, "Usuario o contraseña incorrectos.")
		return
	}
	t := token(32)
	a.mu.Lock()
	if current := a.users[username]; current == nil || !current.Active || current.PasswordHash != hash {
		a.mu.Unlock()
		bad(w, 401, "Usuario o contraseña incorrectos.")
		return
	}
	a.sessions[t] = session{UserID: candidateID, Expires: time.Now().Add(7 * 24 * time.Hour)}
	delete(a.failed, ip)
	a.mu.Unlock()
	a.cookie(w, "bingo_user", t, 7*24*3600)
	jsonReply(w, 200, map[string]any{"user": candidateView})
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	a.mu.Lock()
	delete(a.sessions, readCookie(r, "bingo_user"))
	a.mu.Unlock()
	a.cookie(w, "bingo_user", "", -1)
	a.cookie(w, "bingo_remote_tv", "", -1)
	jsonReply(w, 200, map[string]bool{"ok": true})
}
func (a *app) me(w http.ResponseWriter, r *http.Request) {
	u, ok := a.currentUser(r)
	if !ok {
		jsonReply(w, 200, map[string]bool{"authenticated": false})
		return
	}
	jsonReply(w, 200, map[string]any{"authenticated": true, "user": u.view()})
}

func (a *app) listUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireOwner(w, r); !ok {
		return
	}
	a.mu.Lock()
	users := make([]accountView, 0, len(a.users))
	for _, u := range a.users {
		users = append(users, u.view())
	}
	a.mu.Unlock()
	sort.Slice(users, func(i, j int) bool { return users[i].Username < users[j].Username })
	jsonReply(w, 200, users)
}
func validPassword(password string) bool { return len(password) >= 12 && len(password) <= 72 }
func (a *app) createUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireOwner(w, r); !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	username := strings.ToLower(strings.TrimSpace(input.Username))
	if !usernamePattern.MatchString(username) || !validPassword(input.Password) {
		bad(w, 400, "Usuario inválido o contraseña menor de 12 caracteres.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		bad(w, 500, "No se pudo crear la cuenta")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.users[username] != nil {
		bad(w, 409, "Ese usuario ya existe.")
		return
	}
	u := &account{ID: token(16), Username: username, PasswordHash: string(hash), Role: "player", Active: true, CreatedAt: time.Now()}
	a.users[username] = u
	if err := writeUsers(a.dataDir, a.users); err != nil {
		delete(a.users, username)
		bad(w, 500, "No se pudo guardar la cuenta")
		return
	}
	jsonReply(w, 201, u.view())
}
func (a *app) changePassword(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireOwner(w, r); !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		Password string `json:"password"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	if !validPassword(input.Password) {
		bad(w, 400, "La contraseña debe tener entre 12 y 72 caracteres.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		bad(w, 500, "No se pudo cambiar la contraseña")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	u := a.users[r.PathValue("username")]
	if u == nil {
		bad(w, 404, "Usuario desconocido")
		return
	}
	old := u.PasswordHash
	u.PasswordHash = string(hash)
	if err := writeUsers(a.dataDir, a.users); err != nil {
		u.PasswordHash = old
		bad(w, 500, "No se pudo guardar la contraseña")
		return
	}
	for t, s := range a.sessions {
		if s.UserID == u.ID {
			delete(a.sessions, t)
		}
	}
	jsonReply(w, 200, map[string]bool{"ok": true})
}
func (a *app) updateUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireOwner(w, r); !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		Active *bool `json:"active"`
	}
	if err := decode(r, &input); err != nil || input.Active == nil {
		bad(w, 400, "Estado inválido")
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	u := a.users[r.PathValue("username")]
	if u == nil {
		bad(w, 404, "Usuario desconocido")
		return
	}
	if u.Role == "owner" {
		bad(w, 400, "No se puede desactivar al administrador")
		return
	}
	old := u.Active
	u.Active = *input.Active
	if err := writeUsers(a.dataDir, a.users); err != nil {
		u.Active = old
		bad(w, 500, "No se pudo guardar el estado")
		return
	}
	if !u.Active {
		for t, s := range a.sessions {
			if s.UserID == u.ID {
				delete(a.sessions, t)
			}
		}
	}
	jsonReply(w, 200, u.view())
}

func (a *app) saveLocked() error {
	b, err := json.MarshalIndent(a.games, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(a.dataDir, "games.tmp")
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(a.dataDir, "games.json"))
}
func (a *app) snapshotLocked(id string) []byte {
	b, _ := json.Marshal(a.games[id])
	return b
}
func (a *app) publishLocked(id string) {
	b := a.snapshotLocked(id)
	for ch := range a.watchers[id] {
		select {
		case ch <- b:
		default:
		}
	}
}
func (a *app) tvInit(w http.ResponseWriter, r *http.Request) {
	id := readCookie(r, "bingo_tv")
	a.mu.Lock()
	g := a.games[id]
	if g == nil {
		id = token(16)
		g = &game{ID: id, Drawn: []int{}, Theme: "space"}
		a.games[id] = g
	}
	if !g.Paired && (g.Code == "" || time.Now().After(g.CodeExpires)) {
		for {
			code := strings.ToUpper(token(3))
			unique := true
			for _, other := range a.games {
				if other.Code == code && time.Now().Before(other.CodeExpires) {
					unique = false
					break
				}
			}
			if unique {
				g.Code = code
				break
			}
		}
		g.CodeExpires = time.Now().Add(10 * time.Minute)
	}
	if err := a.saveLocked(); err != nil {
		a.mu.Unlock()
		bad(w, 500, "No se pudo guardar el juego")
		return
	}
	b := a.snapshotLocked(id)
	a.mu.Unlock()
	a.cookie(w, "bingo_tv", id, 365*24*3600)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(b)
}
func (a *app) tvID(r *http.Request) string     { return readCookie(r, "bingo_tv") }
func (a *app) remoteID(r *http.Request) string { return readCookie(r, "bingo_remote_tv") }
func (a *app) events(w http.ResponseWriter, r *http.Request, id string, stillAllowed func() bool) {
	a.mu.Lock()
	if a.games[id] == nil {
		a.mu.Unlock()
		bad(w, 404, "TV desconocida")
		return
	}
	if a.watchers[id] == nil {
		a.watchers[id] = map[chan []byte]bool{}
	}
	ch := make(chan []byte, 1)
	a.watchers[id][ch] = true
	snapshot := a.snapshotLocked(id)
	a.mu.Unlock()
	defer func() { a.mu.Lock(); delete(a.watchers[id], ch); a.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		return
	}
	_, _ = fmt.Fprintf(w, "data: %s\n\n", snapshot)
	flusher.Flush()
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case b := <-ch:
			if stillAllowed != nil && !stillAllowed() {
				return
			}
			_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		case <-ping.C:
			if stillAllowed != nil && !stillAllowed() {
				return
			}
			_, _ = io.WriteString(w, ": ping\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
func (a *app) tvEvents(w http.ResponseWriter, r *http.Request) { a.events(w, r, a.tvID(r), nil) }
func (a *app) remoteEvents(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	a.mu.Lock()
	g := a.games[a.remoteID(r)]
	allowed := g != nil && g.Paired && g.OwnerID == u.ID
	a.mu.Unlock()
	if !allowed {
		bad(w, 404, "Vincula una TV.")
		return
	}
	a.events(w, r, g.ID, func() bool {
		current, ok := a.currentUser(r)
		return ok && current.ID == u.ID
	})
}
func (a *app) remoteState(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	a.mu.Lock()
	g := a.games[a.remoteID(r)]
	if g == nil || !g.Paired || g.OwnerID != u.ID {
		a.mu.Unlock()
		bad(w, 404, "Vincula una TV.")
		return
	}
	snapshot := a.snapshotLocked(g.ID)
	a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(snapshot)
}
func (a *app) remoteTVs(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	type item struct {
		ID    string `json:"id"`
		Drawn int    `json:"drawn"`
		Theme string `json:"theme"`
	}
	a.mu.Lock()
	list := []item{}
	for _, g := range a.games {
		if g.Paired && g.OwnerID == u.ID {
			list = append(list, item{ID: g.ID, Drawn: len(g.Drawn), Theme: g.Theme})
		}
	}
	a.mu.Unlock()
	jsonReply(w, 200, list)
}
func (a *app) remoteSelect(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		ID string `json:"id"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	a.mu.Lock()
	g := a.games[input.ID]
	a.mu.Unlock()
	if g == nil || !g.Paired || g.OwnerID != u.ID {
		bad(w, 404, "TV desconocida")
		return
	}
	a.cookie(w, "bingo_remote_tv", g.ID, 365*24*3600)
	jsonReply(w, 200, map[string]bool{"ok": true})
}
func (a *app) pair(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		Code string `json:"code"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	code := strings.ToUpper(strings.TrimSpace(input.Code))
	a.mu.Lock()
	var selected *game
	for _, g := range a.games {
		if g.Code == code && !g.Paired && time.Now().Before(g.CodeExpires) {
			selected = g
			break
		}
	}
	if selected == nil {
		a.mu.Unlock()
		bad(w, 404, "Código inválido o vencido.")
		return
	}
	selected.Paired = true
	selected.OwnerID = u.ID
	selected.Code = ""
	selected.CodeExpires = time.Time{}
	selected.Revision++
	if err := a.saveLocked(); err != nil {
		a.mu.Unlock()
		bad(w, 500, "No se pudo guardar el vínculo")
		return
	}
	a.publishLocked(selected.ID)
	id := selected.ID
	a.mu.Unlock()
	a.cookie(w, "bingo_remote_tv", id, 365*24*3600)
	jsonReply(w, 200, map[string]bool{"ok": true})
}
func (a *app) action(w http.ResponseWriter, r *http.Request) {
	u, ok := a.requireUser(w, r)
	if !ok {
		return
	}
	if !sameOrigin(r) {
		bad(w, 403, "Origen no permitido")
		return
	}
	var input struct {
		Type  string `json:"type"`
		Value string `json:"value"`
	}
	if err := decode(r, &input); err != nil {
		bad(w, 400, err.Error())
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	g := a.games[a.remoteID(r)]
	if g == nil || !g.Paired || g.OwnerID != u.ID {
		bad(w, 404, "Vincula una TV.")
		return
	}
	switch input.Type {
	case "draw":
		remaining := make([]int, 0, 30-len(g.Drawn))
		seen := map[int]bool{}
		for _, n := range g.Drawn {
			seen[n] = true
		}
		for n := 1; n <= 30; n++ {
			if !seen[n] {
				remaining = append(remaining, n)
			}
		}
		if len(remaining) == 0 {
			bad(w, 409, "Ya salieron las 30 bolitas.")
			return
		}
		index, err := rand.Int(rand.Reader, bigInt(int64(len(remaining))))
		if err != nil {
			bad(w, 500, "No se pudo sortear")
			return
		}
		g.Drawn = append(g.Drawn, remaining[index.Int64()])
	case "undo":
		if len(g.Drawn) == 0 {
			bad(w, 409, "Todavía no hay bolitas.")
			return
		}
		g.Drawn = g.Drawn[:len(g.Drawn)-1]
	case "reset":
		g.Drawn = []int{}
		g.Animation = animation{}
	case "theme":
		if input.Value != "space" && input.Value != "dino" && input.Value != "body" {
			bad(w, 400, "Tema desconocido")
			return
		}
		g.Theme = input.Value
	case "animation":
		if input.Value != "win" && input.Value != "try-again" {
			bad(w, 400, "Animación desconocida")
			return
		}
		g.Animation = animation{ID: time.Now().UnixNano(), Type: input.Value}
	default:
		bad(w, 400, "Acción desconocida")
		return
	}
	g.Revision++
	if err := a.saveLocked(); err != nil {
		bad(w, 500, "No se pudo guardar el juego")
		return
	}
	a.publishLocked(g.ID)
	jsonReply(w, 200, g)
}

// La entrada se acota a 30; big.Int solo se usa para el sorteo seguro.
func bigInt(n int64) *big.Int { return big.NewInt(n) }

func (a *app) cards(w http.ResponseWriter, r *http.Request) {
	if !a.require(w, r) {
		return
	}
	count, err1 := strconv.Atoi(r.URL.Query().Get("count"))
	seed, err2 := strconv.ParseUint(r.URL.Query().Get("seed"), 10, 32)
	if err1 != nil || err2 != nil || count < 1 || count > 240 {
		bad(w, 400, "Cantidad o semilla inválida")
		return
	}
	format := "json"
	if r.URL.Path == "/api/cards/pdf" {
		format = "pdf"
	}
	cmd := exec.CommandContext(r.Context(), "python3", filepath.Join(a.rootDir, "compact_pdf.py"), "--count", strconv.Itoa(count), "--seed", strconv.FormatUint(seed, 10), "--format", format)
	output, err := cmd.Output()
	if err != nil {
		log.Printf("Error del generador: %v", err)
		bad(w, 500, "No se pudo generar el lote")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if format == "pdf" {
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=cartones-bingo-%d.pdf", seed))
	} else {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	}
	_, _ = w.Write(output)
}
func (a *app) static(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.NotFound(w, r)
		return
	}
	path := r.URL.Path
	if path == "/" || path == "/tv" || path == "/tv/" || path == "/remote" || path == "/remote/" || path == "/library" || path == "/library/" {
		path = "/index.html"
	}
	if path != "/index.html" && path != "/app.js" && path != "/style.css" {
		http.NotFound(w, r)
		return
	}
	if path == "/index.html" {
		w.Header().Set("Cache-Control", "no-store")
	}
	http.ServeFile(w, r, filepath.Join(a.distDir, strings.TrimPrefix(path, "/")))
}
