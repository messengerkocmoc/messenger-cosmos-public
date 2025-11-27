package middleware

import (
	"database/sql"
	"net/http"
	"strings"

	gin "github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/messenger-cosmos-public/internal/auth"
)

type Auth struct {
	service *auth.Service
	pool    *pgxpool.Pool
}

type UserContext struct {
	ID        int64
	Name      string
	Email     string
	Avatar    string
	Bio       string
	Birthdate string
	Online    bool
	IsAdmin   bool
}

func NewAuth(service *auth.Service, pool *pgxpool.Pool) *Auth {
	return &Auth{service: service, pool: pool}
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

		var (
			user               UserContext
			avatar, bio, birth sql.NullString
		)
		row := a.pool.QueryRow(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, banned FROM users WHERE id = $1`, claims.UserID)
		var banned bool
		if scanErr := row.Scan(&user.ID, &user.Name, &user.Email, &avatar, &bio, &birth, &user.Online, &user.IsAdmin, &banned); scanErr != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Пользователь не найден"})
			ctx.Abort()
			return
		}

		if banned {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Пользователь заблокирован"})
			ctx.Abort()
			return
		}

		if avatar.Valid {
			user.Avatar = avatar.String
		}
		if bio.Valid {
			user.Bio = bio.String
		}
		if birth.Valid {
			user.Birthdate = birth.String
		}

		ctx.Set("user", user)
		ctx.Next()
	}
}
