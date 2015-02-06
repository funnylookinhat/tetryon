package main

import (
	"fmt"
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"log"
)

const (
	beamCollectionName = "beams"
)

type beam struct {
	Id         bson.ObjectId `bson:"_id"`
	BeamId     string        `bson:"beam_id"`
	Identifier string        `bson:"identifier"`
}

func setupBeamsCollection(session *mgo.Session, config *TetryonConfig) error {
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
		if collectionName == beamCollectionName {
			return nil
		}
	}

	beamCollection := db.C(beamCollectionName)

	err = beamCollection.Create(&mgo.CollectionInfo{
		DisableIdIndex: false,
		ForceIdIndex:   true,
	})

	if err != nil {
		return err
	}

	err = beamCollection.EnsureIndexKey("beam_id", "identifier")

	if err != nil {
		return err
	}

	log.Println("Created new collection: " + beamCollectionName)

	return nil
}

func (b *beam) Init(params map[string]string) error {
	b.Id = bson.NewObjectId()

	var ok bool

	if _, ok = params[paramBeamId]; !ok {
		return fmt.Errorf("Beam missing key: %s", paramBeamId)
	}
	b.BeamId = params[paramBeamId]
	delete(params, paramBeamId)

	if _, ok = params[paramBeamIdentifier]; !ok {
		return fmt.Errorf("Beam missing key: %s", paramBeamIdentifier)
	}
	b.Identifier = params[paramBeamIdentifier]
	delete(params, paramBeamIdentifier)

	return nil
}

func (b *beam) Save(session *mgo.Session, config *TetryonConfig) error {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	beamCollection := sessionCopy.DB(config.MongoConfig.Database).C(beamCollectionName)

	err := beamCollection.Insert(b)

	return err
}

func GetBeamById(beamId string, session *mgo.Session, config *TetryonConfig) (*beam, error) {
	var err error

	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	beamCollection := sessionCopy.DB(config.MongoConfig.Database).C(beamCollectionName)

	b := &beam{}
	err = beamCollection.Find(bson.M{"beam_id": beamId}).One(b)

	// Beam does not exist.
	if err != nil {
		params := make(map[string]string)

		params[paramBeamId] = beamId
		params[paramBeamIdentifier] = beamId

		b.Init(params)
		err = b.Save(session, config)

		if err != nil {
			return nil, err
		}
	}

	return b, nil
}

func (b *beam) Update(params map[string]string, session *mgo.Session, config *TetryonConfig) error {
	if _, ok := params[paramBeamIdentifier]; ok {
		b.Identifier = params[paramBeamIdentifier]
	}

	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	beamCollection := sessionCopy.DB(config.MongoConfig.Database).C(beamCollectionName)

	var err error

	err = beamCollection.Update(bson.M{"_id": b.Id}, bson.M{"$set": bson.M{"identifier": b.Identifier}})

	if err != nil {
		return err
	}

	err = b.ApplyBeamInfo(session, config)

	if err != nil {
		return err
	}

	return nil
}

func (b *beam) ApplyBeamInfo(session *mgo.Session, config *TetryonConfig) error {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	particleCollection := sessionCopy.DB(config.MongoConfig.Database).C(particleCollectionName)

	_, err := particleCollection.UpdateAll(bson.M{"beam_id": b.BeamId}, bson.M{"$set": bson.M{"identifier": b.Identifier}})

	return err
}
