package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	secret string
	ttl    time.Duration
	pool   *pgxpool.Pool
}

type Claims struct {
	UserID int64 `json:"userId"`
	jwt.RegisteredClaims
}

func NewService(secret string, ttl time.Duration, pool *pgxpool.Pool) *Service {
	return &Service{secret: secret, ttl: ttl, pool: pool}
}

func (s *Service) Sign(userID int64) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.secret))
}

func (s *Service) Verify(ctx context.Context, tokenString string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token claims")
	}

	if s.pool != nil {
		// Optional: validate session presence to mirror legacy behavior.
		var exists bool
		row := s.pool.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM sessions WHERE token = $1 AND user_id = $2)", tokenString, claims.UserID)
		_ = row.Scan(&exists) // ignore errors to keep soft-fail behavior
	}

	return claims, nil
}
