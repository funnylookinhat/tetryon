package main

import (
	"fmt"
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"log"
	"time"
)

const (
	particleCollectionName = "particles"
)

type particle struct {
	Id         bson.ObjectId     `bson:"_id"`
	BeamId     string            `bson:"beam_id"`
	Identifier string            `bson:"identifier"`
	Timestamp  int64             `bson:"timestamp"`
	Event      string            `bson:"event"`
	Domain     string            `bson:"domain"`
	Path       string            `bson:"path"`
	Data       map[string]string `bson:"data"`
}

func setupParticlesCollection(session *mgo.Session, config *TetryonConfig) error {
	var err error
	var collectionNames []string

	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	db := sessionCopy.DB(config.MongoConfig.Database)

	collectionNames, err = db.CollectionNames()

	if err != nil {
		return err
	}

	for _, collectionName := range collectionNames {
		if collectionName == particleCollectionName {
			return nil
		}
	}

	particleCollection := db.C(particleCollectionName)

	err = particleCollection.Create(&mgo.CollectionInfo{
		DisableIdIndex: false,
		ForceIdIndex:   true,
	})

	if err != nil {
		return err
	}

	err = particleCollection.EnsureIndexKey("beam_id", "identifier", "timestamp", "event")

	if err != nil {
		return err
	}

	log.Println("Created new collection: " + particleCollectionName)

	return nil
}

// Init Particle
func (p *particle) Init(params map[string]string) error {
	p.Id = bson.NewObjectId()
	p.Timestamp = time.Now().UTC().Unix()

	var ok bool

	if _, ok = params[paramRequestId]; ok {
		delete(params, paramRequestId)
	}

	if _, ok = params[paramBeamId]; !ok {
		return fmt.Errorf("Particle missing key: %s", paramBeamId)
	}
	p.BeamId = params[paramBeamId]
	p.Identifier = params[paramBeamId]
	delete(params, paramBeamId)

	if _, ok = params[paramEvent]; !ok {
		return fmt.Errorf("Particle missing key: %s", paramEvent)
	}
	p.Event = params[paramEvent]
	delete(params, paramEvent)

	if _, ok = params[paramDomain]; !ok {
		return fmt.Errorf("Particle missing key: %s", paramDomain)
	}
	p.Domain = params[paramDomain]
	delete(params, paramDomain)

	if _, ok = params[paramPath]; !ok {
		return fmt.Errorf("Particle missing key: %s", paramPath)
	}
	p.Path = params[paramPath]
	delete(params, paramPath)

	// We can set the rest of the parameters to just be in Data
	p.Data = params

	return nil
}

// Save Particle
func (p *particle) Save(session *mgo.Session, config *TetryonConfig) error {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	particleCollection := sessionCopy.DB(config.MongoConfig.Database).C(particleCollectionName)

	err := particleCollection.Insert(p)
	if err != nil {
		return err
	}

	go func() {
		p.ApplyBeamInfo(session, config)
	}()

	return nil
}

func (p *particle) ApplyBeamInfo(session *mgo.Session, config *TetryonConfig) error {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	particleCollection := sessionCopy.DB(config.MongoConfig.Database).C(particleCollectionName)

	var err error
	var b *beam

	b, err = GetBeamById(p.BeamId, session, config)

	if err != nil {
		return err
	}

	err = particleCollection.Update(bson.M{"_id": p.Id}, bson.M{"$set": bson.M{"identifier": b.Identifier}})

	if err != nil {
		return err
	}

	return nil
}
