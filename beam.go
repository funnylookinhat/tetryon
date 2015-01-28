package main

import (
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
)

type beam struct {
	Id         string            `bson:"id"`
	Timestamp  int64             `bson:"timestamp"`
	Identifier string            `bson:"identifier"`
	Data       map[string]string `bson:"data"`
}
