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
	a := &app{dataDir: t.TempDir(), games: map[string]*game{"tv": {ID: "tv", Paired: true, Drawn: []int{}, Theme: "space"}}, sessions: map[string]time.Time{"owner": time.Now().Add(time.Hour)}, watchers: map[string]map[chan []byte]bool{}}
	call := func(kind, value string) (int, game) {
		body, _ := json.Marshal(map[string]string{"type": kind, "value": value})
		r := httptest.NewRequest(http.MethodPost, "http://bingo.test/api/remote/action", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", "http://bingo.test")
		r.AddCookie(&http.Cookie{Name: "bingo_owner", Value: "owner"})
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
	persisted, err := os.ReadFile(filepath.Join(a.dataDir, "games.json"))
	if err != nil || !bytes.Contains(persisted, []byte(`"drawn": []`)) {
		t.Fatal("el reinicio no quedó guardado")
	}
}
