package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// PlaceholderHandler keeps the surface of routes while Go implementation is developed.
type PlaceholderHandler struct{}

func NewPlaceholderHandler() *PlaceholderHandler {
	return &PlaceholderHandler{}
}

func (h *PlaceholderHandler) NotImplemented(ctx *gin.Context) {
	ctx.JSON(http.StatusNotImplemented, gin.H{
		"message": "Маршрут перенесётся в Go-сервис в следующей итерации",
	})
}
