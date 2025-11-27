package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func RequestID() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ctx.GetHeader("X-Request-ID") == "" {
			ctx.Request.Header.Set("X-Request-ID", uuid.NewString())
		}
		ctx.Header("X-Request-ID", ctx.GetHeader("X-Request-ID"))
		ctx.Next()
	}
}
