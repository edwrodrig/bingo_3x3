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
)

func TestDrawUndoResetAndAnimation(t *testing.T) {
	a := &app{dataDir: t.TempDir(), games: map[string]*game{"tv": {ID: "tv", OwnerID: "u1", Paired: true, Drawn: []int{}, Theme: "space"}}, users: map[string]*account{"bingo": {ID: "u1", Username: "bingo", Role: "owner", Active: true}}, sessions: map[string]session{"owner": {UserID: "u1", Expires: time.Now().Add(time.Hour)}}, watchers: map[string]map[chan []byte]bool{}}
	call := func(kind, value string) (int, game) {
		body, _ := json.Marshal(map[string]string{"type": kind, "value": value})
		r := httptest.NewRequest(http.MethodPost, "http://bingo.test/api/remote/action", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", "http://bingo.test")
		r.AddCookie(&http.Cookie{Name: "bingo_user", Value: "owner"})
		r.AddCookie(&http.Cookie{Name: "bingo_remote_tv", Value: "tv"})
		w := httptest.NewRecorder()
		a.action(w, r)
		var g game
		_ = json.Unmarshal(w.Body.Bytes(), &g)
		return w.Code, g
	}
	seen := map[int]bool{}
	for i := 0; i < 30; i++ {
		status, g := call("draw", "")
		if status != 200 || len(g.Drawn) != i+1 {
			t.Fatalf("sorteo %d: HTTP %d, %d números", i, status, len(g.Drawn))
		}
		n := g.Drawn[len(g.Drawn)-1]
		if n < 1 || n > 30 || seen[n] {
			t.Fatalf("bolita inválida o repetida: %d", n)
		}
		seen[n] = true
	}
	if status, _ := call("draw", ""); status != 409 {
		t.Fatalf("esperaba 409 al agotar las bolitas, obtuve %d", status)
	}
	if status, g := call("undo", ""); status != 200 || len(g.Drawn) != 29 {
		t.Fatal("deshacer falló")
	}
	if status, g := call("draw", ""); status != 200 || len(g.Drawn) != 30 {
		t.Fatal("no se pudo volver a sacar la bolita")
	}
	if status, g := call("animation", "win"); status != 200 || g.Animation.Type != "win" || g.Animation.ID == 0 {
		t.Fatal("animación de ganador falló")
	}
	if status, g := call("reset", ""); status != 200 || len(g.Drawn) != 0 {
		t.Fatal("nueva partida falló")
	}
	if status, _ := call("mode", "6x6"); status != 400 {
		t.Fatal("se aceptó una modalidad inválida")
	}
	for _, tc := range []struct {
		mode  string
		total int
	}{{"4x4", 60}, {"5x5", 75}} {
		if status, g := call("mode", tc.mode); status != 200 || g.Mode != tc.mode || len(g.Drawn) != 0 {
			t.Fatalf("cambio a %s falló", tc.mode)
		}
		seen := map[int]bool{}
		for i := 0; i < tc.total; i++ {
			status, g := call("draw", "")
			if status != 200 || len(g.Drawn) != i+1 {
				t.Fatalf("sorteo %s: HTTP %d", tc.mode, status)
			}
			n := g.Drawn[i]
			if n < 1 || n > tc.total || seen[n] {
				t.Fatalf("bolita inválida en %s: %d", tc.mode, n)
			}
			seen[n] = true
		}
		if status, _ := call("draw", ""); status != 409 {
			t.Fatalf("no se agotó %s", tc.mode)
		}
	}
	if status, g := call("mode", "3x3"); status != 200 || g.Mode != "3x3" || len(g.Drawn) != 0 {
		t.Fatal("cambio de modalidad no inició un sorteo nuevo")
	}
	persisted, err := os.ReadFile(filepath.Join(a.dataDir, "games.json"))
	if err != nil || !bytes.Contains(persisted, []byte(`"drawn": []`)) {
		t.Fatal("el reinicio no quedó guardado")
	}
}
