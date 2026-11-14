package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func TestLegacyOwnerMigratesAndUsersAreIsolated(t *testing.T) {
	dir := t.TempDir()
	hash, err := bcrypt.GenerateFromPassword([]byte("owner-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.hash"), hash, 0600); err != nil {
		t.Fatal(err)
	}
	a := &app{dataDir: dir, users: map[string]*account{}, games: map[string]*game{}, sessions: map[string]session{}, watchers: map[string]map[chan []byte]bool{}, failed: map[string][]time.Time{}}
	if err := a.loadUsers(); err != nil {
		t.Fatal(err)
	}
	if a.users["bingo"] == nil || a.users["bingo"].Role != "owner" {
		t.Fatal("No migró el administrador")
	}
	if _, err := os.Stat(filepath.Join(dir, "users.json")); err != nil {
		t.Fatal("No guardó las cuentas")
	}
	ownerID := a.users["bingo"].ID
	a.games["tv-owner"] = &game{ID: "tv-owner", OwnerID: ownerID, Paired: true, Drawn: []int{}, Theme: "space"}
	a.games["tv-new"] = &game{ID: "tv-new", Code: "ABC123", CodeExpires: time.Now().Add(time.Minute), Drawn: []int{}, Theme: "space"}
	request := func(method, path, cookie string, body any, handler http.HandlerFunc) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		r := httptest.NewRequest(method, "http://bingo.test"+path, bytes.NewReader(raw))
		if body != nil {
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", "http://bingo.test")
		}
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: "bingo_user", Value: cookie})
		}
		w := httptest.NewRecorder()
		handler(w, r)
		return w
	}
	requestTV := func(method, path, cookie, tvID string, body any, handler http.HandlerFunc) *httptest.ResponseRecorder {
		var raw []byte
		if body != nil {
			raw, _ = json.Marshal(body)
		}
		r := httptest.NewRequest(method, "http://bingo.test"+path, bytes.NewReader(raw))
		if body != nil {
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", "http://bingo.test")
		}
		r.AddCookie(&http.Cookie{Name: "bingo_user", Value: cookie})
		r.AddCookie(&http.Cookie{Name: "bingo_remote_tv", Value: tvID})
		w := httptest.NewRecorder()
		handler(w, r)
		return w
	}
	ownerLogin := request("POST", "/api/auth/login", "", map[string]string{"username": "bingo", "password": "owner-password-123"}, a.login)
	if ownerLogin.Code != 200 {
		t.Fatalf("login migrado: %d %s", ownerLogin.Code, ownerLogin.Body.String())
	}
	ownerCookie := ownerLogin.Result().Cookies()[0].Value
	created := request("POST", "/api/users", ownerCookie, map[string]string{"username": "familia", "password": "family-password-123"}, a.createUser)
	if created.Code != 201 {
		t.Fatalf("crear usuario: %d %s", created.Code, created.Body.String())
	}
	if bytes.Contains(created.Body.Bytes(), []byte("passwordHash")) {
		t.Fatal("La API expuso el hash")
	}
	reopened := &app{dataDir: dir, users: map[string]*account{}}
	if err := reopened.loadUsers(); err != nil || reopened.users["familia"] == nil {
		t.Fatal("La cuenta nueva no sobrevivió a la reapertura")
	}
	playerLogin := request("POST", "/api/auth/login", "", map[string]string{"username": "familia", "password": "family-password-123"}, a.login)
	if playerLogin.Code != 200 {
		t.Fatalf("login segundo usuario: %d", playerLogin.Code)
	}
	playerCookie := playerLogin.Result().Cookies()[0].Value
	if got := request("GET", "/api/users", playerCookie, nil, a.listUsers).Code; got != 403 {
		t.Fatalf("usuario común pudo gestionar cuentas: %d", got)
	}
	if got := requestTV("GET", "/api/remote/state", playerCookie, "tv-owner", nil, a.remoteState).Code; got != 404 {
		t.Fatalf("usuario común pudo leer TV ajena: %d", got)
	}
	if got := requestTV("POST", "/api/remote/action", playerCookie, "tv-owner", map[string]string{"type": "draw"}, a.action).Code; got != 404 {
		t.Fatalf("usuario común pudo sortear en TV ajena: %d", got)
	}
	if got := requestTV("POST", "/api/remote/select", playerCookie, "tv-owner", map[string]string{"id": "tv-owner"}, a.remoteSelect).Code; got != 404 {
		t.Fatalf("usuario común pudo seleccionar TV ajena: %d", got)
	}
	if got := request("POST", "/api/pair", playerCookie, map[string]string{"code": "ABC123"}, a.pair).Code; got != 200 {
		t.Fatalf("vincular TV propia: %d", got)
	}
	list := request("GET", "/api/remote/tvs", playerCookie, nil, a.remoteTVs)
	if list.Code != 200 || bytes.Contains(list.Body.Bytes(), []byte("tv-owner")) || !bytes.Contains(list.Body.Bytes(), []byte("tv-new")) {
		t.Fatalf("lista TV incorrecta: %s", list.Body.String())
	}
	reset := request("PUT", "/api/users/familia/password", ownerCookie, map[string]string{"password": "new-password-123"}, func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("username", "familia")
		a.changePassword(w, r)
	})
	if reset.Code != 200 {
		t.Fatalf("cambiar contraseña: %d", reset.Code)
	}
	if got := request("GET", "/api/remote/tvs", playerCookie, nil, a.remoteTVs).Code; got != 401 {
		t.Fatalf("la sesión antigua sobrevivió al cambio: %d", got)
	}
	if got := request("POST", "/api/auth/login", "", map[string]string{"username": "familia", "password": "family-password-123"}, a.login).Code; got != 401 {
		t.Fatalf("clave antigua aún sirve: %d", got)
	}
	if got := request("POST", "/api/auth/login", "", map[string]string{"username": "familia", "password": "new-password-123"}, a.login).Code; got != 200 {
		t.Fatalf("clave nueva falla: %d", got)
	}
	disabled := request("PATCH", "/api/users/familia", ownerCookie, map[string]bool{"active": false}, func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("username", "familia")
		a.updateUser(w, r)
	})
	if disabled.Code != 200 {
		t.Fatalf("desactivar usuario: %d", disabled.Code)
	}
	if got := request("POST", "/api/auth/login", "", map[string]string{"username": "familia", "password": "new-password-123"}, a.login).Code; got != 401 {
		t.Fatalf("usuario desactivado puede entrar: %d", got)
	}
}
