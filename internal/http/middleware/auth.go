package middleware

import (
	"net/http"
	"strings"

	gin "github.com/gin-gonic/gin"

	"github.com/messenger-cosmos-public/internal/auth"
)

type Auth struct {
	service *auth.Service
}

func NewAuth(service *auth.Service) *Auth {
	return &Auth{service: service}
}

func (a *Auth) Middleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		header := ctx.GetHeader("Authorization")
		token := ""
		if header != "" {
			parts := strings.SplitN(header, " ", 2)
			if len(parts) == 2 {
				token = parts[1]
			}
		}
		if token == "" {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
			ctx.Abort()
			return
		}

		claims, err := a.service.Verify(ctx, token)
		if err != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Недействительный токен"})
			ctx.Abort()
			return
		}

		ctx.Set("userId", claims.UserID)
		ctx.Next()
	}
}
