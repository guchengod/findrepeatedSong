package main

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	conn *websocket.Conn
	send chan interface{}
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan interface{}
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

var hub = Hub{
	clients:    make(map[*Client]bool),
	broadcast:  make(chan interface{}, 256),
	register:   make(chan *Client),
	unregister: make(chan *Client),
}

type progressMessage struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

var progressState = struct {
	sync.RWMutex
	messages map[string]progressMessage
}{messages: make(map[string]progressMessage)}

func currentProgressMessages() []progressMessage {
	progressState.RLock()
	defer progressState.RUnlock()
	messages := make([]progressMessage, 0, len(progressState.messages))
	for _, message := range progressState.messages {
		messages = append(messages, message)
	}
	return messages
}

func (h *Hub) send(client *Client, message interface{}) bool {
	select {
	case client.send <- message:
		return true
	default:
		return false
	}
}

func (h *Hub) sendSnapshots(client *Client) bool {
	for _, message := range currentProgressMessages() {
		if !h.send(client, message) {
			return false
		}
	}
	return true
}

func (h *Hub) sendSnapshotsToAll() {
	for client := range h.clients {
		if !h.sendSnapshots(client) {
			close(client.send)
			delete(h.clients, client)
		}
	}
}

func (h *Hub) run() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if !h.sendSnapshots(client) {
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				if !h.send(client, message) {
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		case <-ticker.C:
			h.mu.Lock()
			h.sendSnapshotsToAll()
			h.mu.Unlock()
		}
	}
}

func serveWs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	client := &Client{conn: conn, send: make(chan interface{}, 256)}
	hub.register <- client

	go client.writePump()
}

func serveWsGin(c *gin.Context) {
	serveWs(c.Writer, c.Request)
}

func (c *Client) writePump() {
	defer func() {
		hub.unregister <- c
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteJSON(message); err != nil {
				return
			}
		}
	}
}

func broadcastProgress(topic string, data interface{}) {
	message := progressMessage{Topic: topic, Data: data}
	progressState.Lock()
	progressState.messages[topic] = message
	progressState.Unlock()

	// Progress is cached for reconnecting clients. The buffered, non-blocking
	// send keeps command tests from depending on a running WebSocket hub; a
	// periodic snapshot makes a transient full queue self-healing for the UI.
	select {
	case hub.broadcast <- message:
	default:
	}
}
