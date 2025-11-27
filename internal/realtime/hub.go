package realtime

import (
	"sync"
)

// Hub is a placeholder for WebSocket fanout compatible with the legacy event protocol.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]chan []byte
}

func NewHub() *Hub {
	return &Hub{clients: map[string]chan []byte{}}
}

func (h *Hub) Broadcast(payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.clients {
		select {
		case ch <- payload:
		default:
		}
	}
}
